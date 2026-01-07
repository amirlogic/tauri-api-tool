// Prevents additional console window on Windows in release, DO NOT REMOVE!!
#![cfg_attr(not(debug_assertions), windows_subsystem = "windows")]

use std::fs::File;
use std::io::{self, Read};
//use tauri::State;
//use tauri::{CustomMenuItem, Menu, MenuItem, Submenu};

#[tauri::command]
fn read_markdown_file(filename: &str) -> Result<String, String> {
    let mut file = File::open(filename).map_err(|e| e.to_string())?;
    let mut contents = String::new();
    file.read_to_string(&mut contents)
        .map_err(|e| e.to_string())?;
    Ok(contents)
}

#[tauri::command]
fn get_os() -> String {
    if cfg!(target_os = "windows") {
        "Windows".to_string()
    } else if cfg!(target_os = "linux") {
        "Linux".to_string()
    } else if cfg!(target_os = "macos") {
        "macOS".to_string()
    } else {
        "Unknown".to_string()
    }
}

fn main() {
    tauri::Builder::default()
        .plugin(tauri_plugin_sql::Builder::new().build())
        .plugin(tauri_plugin_cli::init())
        .plugin(tauri_plugin_deep_link::init())
        .plugin(tauri_plugin_os::init())
        .plugin(tauri_plugin_opener::init())
        .plugin(tauri_plugin_shell::init())
        .plugin(tauri_plugin_dialog::init())
        .plugin(tauri_plugin_store::Builder::new().build())
        .plugin(tauri_plugin_fs::init())
        .invoke_handler(tauri::generate_handler![read_markdown_file, get_os])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
    tauri2_lib::run();
}

/* use std::fs::File;
use std::io::{self, Read};

fn read_markdown_file(filename: &str) -> io::Result<String> {
    let mut file = File::open(filename)?;
    let mut contents = String::new();
    file.read_to_string(&mut contents)?;
    Ok(contents)
}

#[cfg(target_os = "windows")]
fn get_os() -> &'static str {
    "Windows"
}

#[cfg(target_os = "linux")]
fn get_os() -> &'static str {
    "Linux"
}

#[cfg(target_os = "macos")]
fn get_os() -> &'static str {
    "macOS"
} */

/* fn main() {
    tauri2_lib::run()
}
 */
