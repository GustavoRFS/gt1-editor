use midir::{Ignore, MidiInput, MidiInputConnection, MidiOutput, MidiOutputConnection};
use serde::Serialize;
use std::sync::{Arc, Mutex};
use tauri::{AppHandle, Emitter};

const SYSEX_EVENT: &str = "gt1-sysex";
const MAX_SYSEX_LENGTH: usize = 8192;

#[derive(Debug, Clone, Serialize)]
pub struct MidiError {
    pub code: String,
    pub message: String,
}

impl MidiError {
    pub fn new(code: &str, message: impl Into<String>) -> Self {
        Self {
            code: code.to_string(),
            message: message.into(),
        }
    }
}

impl std::fmt::Display for MidiError {
    fn fmt(&self, formatter: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
        write!(formatter, "{}", self.message)
    }
}

impl std::error::Error for MidiError {}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct MidiDevice {
    pub id: String,
    pub name: String,
}

pub struct ActiveConnection {
    pub _input: MidiInputConnection<()>,
    pub output: MidiOutputConnection,
}

#[derive(Default)]
struct SysexAssembler {
    pending: Vec<u8>,
}

impl SysexAssembler {
    fn push(&mut self, data: &[u8]) -> Vec<Vec<u8>> {
        let mut completed = Vec::new();
        for byte in data {
            if *byte == 0xf0 {
                self.pending.clear();
                self.pending.push(*byte);
                continue;
            }
            if self.pending.is_empty() {
                continue;
            }
            self.pending.push(*byte);
            if self.pending.len() > MAX_SYSEX_LENGTH {
                self.pending.clear();
                continue;
            }
            if *byte == 0xf7 {
                completed.push(std::mem::take(&mut self.pending));
            }
        }
        completed
    }
}

fn device_indices(device_id: &str) -> Result<(usize, usize), MidiError> {
    let mut input = None;
    let mut output = None;
    for part in device_id.split(';') {
        if let Some(value) = part.strip_prefix("in=") {
            input = value.parse::<usize>().ok();
        } else if let Some(value) = part.strip_prefix("out=") {
            output = value.parse::<usize>().ok();
        }
    }
    match (input, output) {
        (Some(input_index), Some(output_index)) => Ok((input_index, output_index)),
        _ => Err(MidiError::new("invalid-device", "Identificador MIDI inválido ou expirado. Atualize a lista de dispositivos.")),
    }
}

pub fn list_devices() -> Result<Vec<MidiDevice>, MidiError> {
    let input = MidiInput::new("GT-1 Editor").map_err(|error| MidiError::new("backend-unavailable", error.to_string()))?;
    let output = MidiOutput::new("GT-1 Editor").map_err(|error| MidiError::new("backend-unavailable", error.to_string()))?;
    let input_ports = input.ports();
    let output_ports = output.ports();

    let input_names: Vec<String> = input_ports
        .iter()
        .map(|port| input.port_name(port).unwrap_or_else(|_| "MIDI input".to_string()))
        .collect();
    let output_names: Vec<String> = output_ports
        .iter()
        .map(|port| output.port_name(port).unwrap_or_else(|_| "MIDI output".to_string()))
        .collect();

    let mut devices = Vec::new();
    for (input_index, input_name) in input_names.iter().enumerate() {
        let paired = output_names
            .iter()
            .position(|output_name| output_name == input_name)
            .or_else(|| {
                let matching_inputs: Vec<usize> = input_names
                    .iter()
                    .enumerate()
                    .filter(|(_, name)| name.to_lowercase().contains("gt-1"))
                    .map(|(index, _)| index)
                    .collect();
                let matching_outputs: Vec<usize> = output_names
                    .iter()
                    .enumerate()
                    .filter(|(_, name)| name.to_lowercase().contains("gt-1"))
                    .map(|(index, _)| index)
                    .collect();
                if matching_inputs.len() == 1 && matching_outputs.len() == 1 && matching_inputs[0] == input_index {
                    Some(matching_outputs[0])
                } else if input_names.len() == output_names.len() {
                    Some(input_index)
                } else {
                    None
                }
            });

        if let Some(output_index) = paired {
            let output_name = output_names.get(output_index).map(String::as_str).unwrap_or("MIDI output");
            let name = if input_name == output_name {
                input_name.clone()
            } else {
                format!("{input_name} / {output_name}")
            };
            devices.push(MidiDevice {
                id: format!("in={input_index};out={output_index}"),
                name,
            });
        }
    }
    Ok(devices)
}

pub fn connect(
    connection: &Mutex<Option<ActiveConnection>>,
    app: AppHandle,
    device_id: &str,
) -> Result<(), MidiError> {
    if !list_devices()?.iter().any(|device| device.id == device_id) {
        return Err(MidiError::new("device-disconnected", "O dispositivo não está mais disponível na lista de portas MIDI."));
    }
    let (input_index, output_index) = device_indices(device_id)?;
    let mut midi_input = MidiInput::new("GT-1 Editor input")
        .map_err(|error| MidiError::new("backend-unavailable", error.to_string()))?;
    midi_input.ignore(Ignore::None);
    let input_port = midi_input
        .ports()
        .into_iter()
        .nth(input_index)
        .ok_or_else(|| MidiError::new("device-disconnected", "A porta MIDI de entrada não está mais disponível."))?;

    let midi_output = MidiOutput::new("GT-1 Editor output")
        .map_err(|error| MidiError::new("backend-unavailable", error.to_string()))?;
    let output_port = midi_output
        .ports()
        .into_iter()
        .nth(output_index)
        .ok_or_else(|| MidiError::new("device-disconnected", "A porta MIDI de saída não está mais disponível."))?;

    let assembler = Arc::new(Mutex::new(SysexAssembler::default()));
    let callback_assembler = Arc::clone(&assembler);
    let input_connection = midi_input
        .connect(
            &input_port,
            "GT-1 Editor input",
            move |_timestamp, message, _| {
                if let Ok(mut assembler) = callback_assembler.lock() {
                    for frame in assembler.push(message) {
                        let _ = app.emit(SYSEX_EVENT, frame);
                    }
                }
            },
            (),
        )
        .map_err(|error| MidiError::new("connect-failed", error.to_string()))?;
    let output_connection = midi_output
        .connect(&output_port, "GT-1 Editor output")
        .map_err(|error| MidiError::new("connect-failed", error.to_string()))?;

    let mut state = connection
        .lock()
        .map_err(|_| MidiError::new("state-poisoned", "O estado MIDI do aplicativo ficou indisponível."))?;
    *state = Some(ActiveConnection {
        _input: input_connection,
        output: output_connection,
    });
    Ok(())
}

pub fn disconnect(connection: &Mutex<Option<ActiveConnection>>) -> Result<(), MidiError> {
    let mut state = connection
        .lock()
        .map_err(|_| MidiError::new("state-poisoned", "O estado MIDI do aplicativo ficou indisponível."))?;
    *state = None;
    Ok(())
}

pub fn send_sysex(connection: &Mutex<Option<ActiveConnection>>, data: &[u8]) -> Result<(), MidiError> {
    if data.len() < 2 || data.first() != Some(&0xf0) || data.last() != Some(&0xf7) {
        return Err(MidiError::new("invalid-sysex", "O envio exige uma mensagem SysEx completa, de F0 a F7."));
    }
    if data.len() > MAX_SYSEX_LENGTH {
        return Err(MidiError::new("message-too-large", "A mensagem SysEx excede 8192 bytes."));
    }
    let mut state = connection
        .lock()
        .map_err(|_| MidiError::new("state-poisoned", "O estado MIDI do aplicativo ficou indisponível."))?;
    let active = state
        .as_mut()
        .ok_or_else(|| MidiError::new("not-connected", "Nenhuma porta MIDI está conectada."))?;
    active
        .output
        .send(data)
        .map_err(|error| MidiError::new("send-failed", error.to_string()))
}
