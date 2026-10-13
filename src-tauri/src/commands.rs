use crate::midi::{self, ActiveConnection, MidiDevice, MidiError};
use std::sync::Mutex;
use tauri::{AppHandle, State};

#[derive(Default)]
pub struct MidiState {
    connection: Mutex<Option<ActiveConnection>>,
}

#[tauri::command]
pub fn list_midi_devices() -> Result<Vec<MidiDevice>, MidiError> {
    midi::list_devices()
}

#[tauri::command]
pub fn connect_midi(device_id: String, app: AppHandle, state: State<'_, MidiState>) -> Result<(), MidiError> {
    midi::connect(&state.connection, app, &device_id)
}

#[tauri::command]
pub fn disconnect_midi(state: State<'_, MidiState>) -> Result<(), MidiError> {
    midi::disconnect(&state.connection)
}

#[tauri::command]
pub fn send_sysex(data: Vec<u8>, state: State<'_, MidiState>) -> Result<(), MidiError> {
    midi::send_sysex(&state.connection, &data)
}
