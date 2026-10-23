//! Tauri shell: exposes the protocol crate to the web UI as commands.

use std::sync::Mutex;

use boyi_protocol::layout::{self, Key, KeyPos};
use boyi_protocol::led::LedConfig;
use boyi_protocol::magnetic::{KeyTrigger, TriggerSettings};
use boyi_protocol::{device::DeviceInfo, Keyboard};
use tauri::State;

/// The open keyboard, if any. Dropped after an I/O error so the next call reconnects.
#[derive(Default)]
struct Connection(Mutex<Option<Keyboard>>);

impl Connection {
    fn with<T>(&self, f: impl FnOnce(&Keyboard) -> boyi_protocol::Result<T>) -> Result<T, String> {
        let mut slot = self.0.lock().unwrap_or_else(|e| e.into_inner());
        if slot.is_none() {
            *slot = Some(Keyboard::open_first().map_err(|e| e.to_string())?);
        }
        let result = f(slot.as_ref().expect("connected above"));
        if let Err(boyi_protocol::Error::Io(_) | boyi_protocol::Error::Timeout(_)) = &result {
            *slot = None;
        }
        result.map_err(|e| e.to_string())
    }
}

#[tauri::command]
fn layout() -> &'static [Key] {
    &layout::KEYS
}

#[tauri::command]
fn device_info(conn: State<Connection>) -> Result<DeviceInfo, String> {
    conn.with(Keyboard::info)
}

#[tauri::command]
fn get_led(conn: State<Connection>) -> Result<LedConfig, String> {
    conn.with(Keyboard::led)
}

#[tauri::command]
fn set_led(conn: State<Connection>, config: LedConfig) -> Result<LedConfig, String> {
    conn.with(|kb| kb.set_led(&config))
}

#[tauri::command]
fn get_key_trigger(conn: State<Connection>, key: KeyPos) -> Result<KeyTrigger, String> {
    conn.with(|kb| kb.key_trigger(key))
}

#[tauri::command]
fn set_trigger(
    conn: State<Connection>,
    keys: Vec<KeyPos>,
    settings: TriggerSettings,
) -> Result<(), String> {
    conn.with(|kb| kb.set_trigger(&keys, &settings))
}

pub fn run() {
    tauri::Builder::default()
        .manage(Connection::default())
        .invoke_handler(tauri::generate_handler![
            layout,
            device_info,
            get_led,
            set_led,
            get_key_trigger,
            set_trigger
        ])
        .run(tauri::generate_context!())
        .expect("failed to start BoyiLin66");
}
