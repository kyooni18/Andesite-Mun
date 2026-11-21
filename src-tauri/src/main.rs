#![cfg_attr(not(debug_assertions), windows_subsystem = "windows")]
fn main() { tauri_plugin_mun_desktop::run(tauri::generate_context!()) }
