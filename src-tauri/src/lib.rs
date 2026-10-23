//! Tauri shell: exposes the protocol crate to the web UI as commands.

use std::fs;
use std::io::ErrorKind;
use std::path::PathBuf;
use std::sync::Mutex;

use boyi_protocol::keymap::Keymap;
use boyi_protocol::layout::{self, Key, KeyPos};
use boyi_protocol::led::LedConfig;
use boyi_protocol::magnetic::{KeyTrigger, TriggerSettings};
use boyi_protocol::{device::DeviceInfo, Keyboard};
use tauri::{Manager, State};

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

/// The keyboard cannot report its key assignments, so the last one written is kept here.
struct KeymapFile(PathBuf);

impl KeymapFile {
    fn load(&self) -> Result<Keymap, String> {
        match fs::read(&self.0) {
            Ok(bytes) => serde_json::from_slice(&bytes)
                .map_err(|e| format!("{} is unreadable: {e}", self.0.display())),
            Err(e) if e.kind() == ErrorKind::NotFound => Ok(Keymap::factory()),
            Err(e) => Err(e.to_string()),
        }
    }

    /// Writes through a temporary file so a crash never leaves a truncated copy.
    fn save(&self, map: &Keymap) -> Result<(), String> {
        let json = serde_json::to_vec_pretty(map).map_err(|e| e.to_string())?;
        if let Some(dir) = self.0.parent() {
            fs::create_dir_all(dir).map_err(|e| e.to_string())?;
        }
        let tmp = self.0.with_extension("json.tmp");
        fs::write(&tmp, json)
            .and_then(|_| fs::rename(&tmp, &self.0))
            .map_err(|e| e.to_string())
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

/// The last keymap this app wrote, or the factory layout if it never wrote one.
#[tauri::command]
fn get_keymap(file: State<KeymapFile>) -> Result<Keymap, String> {
    file.load()
}

#[tauri::command]
fn factory_keymap() -> Keymap {
    Keymap::factory()
}

/// Writes the keymap to the keyboard, then remembers it.
#[tauri::command]
fn set_keymap(
    conn: State<Connection>,
    file: State<KeymapFile>,
    keymap: Keymap,
) -> Result<(), String> {
    conn.with(|kb| kb.write_keymap(&keymap))?;
    file.save(&keymap)
}

pub fn run() {
    tauri::Builder::default()
        .manage(Connection::default())
        .setup(|app| {
            let path = app.path().app_data_dir()?.join("keymap.json");
            app.manage(KeymapFile(path));
            Ok(())
        })
        .invoke_handler(tauri::generate_handler![
            layout,
            device_info,
            get_led,
            set_led,
            get_key_trigger,
            set_trigger,
            get_keymap,
            factory_keymap,
            set_keymap
        ])
        .run(tauri::generate_context!())
        .expect("failed to start BoyiLin66");
}
