use crate::midi::{self, ActiveConnection, MidiDevice, MidiError};
use std::sync::Mutex;
use tauri::{AppHandle, State};

#[derive(serde::Serialize)]
pub struct HttpResponseSummary {
    status: u16,
    body: String,
}

#[tauri::command]
pub async fn send_http_request(
    url: String,
    method: String,
    headers: std::collections::HashMap<String, String>,
    body: Option<String>,
) -> Result<HttpResponseSummary, String> {
    let parsed_url = reqwest::Url::parse(&url).map_err(|error| error.to_string())?;
    if !matches!(parsed_url.scheme(), "http" | "https") {
        return Err("A URL precisa usar HTTP ou HTTPS.".to_string());
    }
    let method = reqwest::Method::from_bytes(method.as_bytes()).map_err(|error| error.to_string())?;
    let mut request = reqwest::Client::builder()
        .timeout(std::time::Duration::from_secs(10))
        .build()
        .map_err(|error| error.to_string())?
        .request(method, parsed_url);
    for (name, value) in headers {
        request = request.header(name, value);
    }
    if let Some(body) = body { request = request.body(body); }
    let response = request.send().await.map_err(|error| error.to_string())?;
    let status = response.status().as_u16();
    let body = response.text().await.unwrap_or_default();
    Ok(HttpResponseSummary { status, body })
}

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

#[tauri::command]
pub fn send_midi_message(data: Vec<u8>, state: State<'_, MidiState>) -> Result<(), MidiError> {
    midi::send_midi_message(&state.connection, &data)
}
