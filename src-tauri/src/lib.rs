#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .on_permission_request(|_, kind| match kind {
            tauri::webview::PermissionKind::Camera | tauri::webview::PermissionKind::Microphone => {
                tauri::webview::PermissionResponse::Allow
            }
            _ => tauri::webview::PermissionResponse::Default,
        })
        .plugin(tauri_plugin_dialog::init())
        .plugin(tauri_plugin_fs::init())
        .manage(commands::MidiState::default())
        .invoke_handler(tauri::generate_handler![
            commands::list_midi_devices,
            commands::connect_midi,
            commands::disconnect_midi,
            commands::send_sysex,
            commands::send_midi_message,
            commands::send_http_request
        ])
        .run(tauri::generate_context!())
        .expect("failed to run GT-1 Editor");
}

mod commands;
mod midi;
