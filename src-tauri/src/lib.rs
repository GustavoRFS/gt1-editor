#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .manage(commands::MidiState::default())
        .invoke_handler(tauri::generate_handler![
            commands::list_midi_devices,
            commands::connect_midi,
            commands::disconnect_midi,
            commands::send_sysex
        ])
        .run(tauri::generate_context!())
        .expect("failed to run GT-1 Editor");
}

mod commands;
mod midi;
