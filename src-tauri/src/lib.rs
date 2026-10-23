//! Tauri shell: exposes the protocol crate to the web UI as commands.

use std::fs;
use std::io::ErrorKind;
use std::marker::PhantomData;
use std::path::{Path, PathBuf};
use std::sync::Mutex;

use boyi_protocol::keymap::Keymap;
use boyi_protocol::layout::{self, Key, KeyPos};
use boyi_protocol::led::{KeyColors, LedConfig};
use boyi_protocol::magnetic::{KeyTrigger, TriggerSettings};
use boyi_protocol::{device::DeviceInfo, Keyboard};
use serde::{de::DeserializeOwned, Serialize};
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

/// The keyboard cannot report its key assignments or per-key colours, so the
/// last ones written are kept in the app data dir.
struct SavedCopy<T>(PathBuf, PhantomData<T>);

impl<T: Serialize + DeserializeOwned + Default> SavedCopy<T> {
    fn new(path: PathBuf) -> Self {
        Self(path, PhantomData)
    }

    /// The saved copy, validated like a value about to be written; the default if none.
    fn load(&self) -> Result<T, String> {
        match fs::read(&self.0) {
            Ok(bytes) => serde_json::from_slice(&bytes)
                .map_err(|e| format!("saved copy {} is invalid: {e}", self.0.display())),
            Err(e) if e.kind() == ErrorKind::NotFound => Ok(T::default()),
            Err(e) => Err(e.to_string()),
        }
    }

    /// Writes the new copy next to the saved one; [`Self::commit`] makes it current.
    /// Done before the keyboard is touched, so a full disk fails without side effects.
    fn stage(&self, value: &T) -> std::io::Result<PathBuf> {
        let json = serde_json::to_vec_pretty(value).map_err(std::io::Error::other)?;
        if let Some(dir) = self.0.parent() {
            fs::create_dir_all(dir)?;
        }
        let tmp = self.0.with_extension("json.tmp");
        fs::write(&tmp, json)?;
        Ok(tmp)
    }

    fn commit(&self, staged: &Path) -> std::io::Result<()> {
        fs::rename(staged, &self.0)
    }

    /// Stages the copy, runs `write` on the keyboard, then makes the copy current.
    fn write_and_save(
        &self,
        conn: &Connection,
        value: &T,
        write: impl FnOnce(&Keyboard) -> boyi_protocol::Result<()>,
    ) -> Result<(), String> {
        let staged = self
            .stage(value)
            .map_err(|e| format!("could not save the copy, keyboard not changed: {e}"))?;
        if let Err(e) = conn.with(write) {
            let _ = fs::remove_file(&staged);
            return Err(format!(
                "keyboard write failed and may be partly applied: {e}"
            ));
        }
        self.commit(&staged)
            .map_err(|e| format!("keyboard updated, but saving the copy failed: {e}"))
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

/// Calibrates one key; the user has 15 s to press it to the bottom. Runs off
/// the main thread so the window stays responsive while waiting.
#[tauri::command(async)]
fn calibrate_key(conn: State<Connection>, key: KeyPos) -> Result<bool, String> {
    conn.with(|kb| kb.calibrate_key(key, std::time::Duration::from_secs(15)))
}

/// The last keymap this app wrote, or the factory layout if it never wrote one.
#[tauri::command]
fn get_keymap(file: State<SavedCopy<Keymap>>) -> Result<Keymap, String> {
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
    file: State<SavedCopy<Keymap>>,
    keymap: Keymap,
) -> Result<(), String> {
    file.write_and_save(&conn, &keymap, |kb| kb.write_keymap(&keymap))
}

/// The last Custom-effect colours this app wrote, or all white.
#[tauri::command]
fn get_key_colors(file: State<SavedCopy<KeyColors>>) -> Result<KeyColors, String> {
    file.load()
}

/// Writes the Custom-effect colours to the keyboard, then remembers them.
#[tauri::command]
fn set_key_colors(
    conn: State<Connection>,
    file: State<SavedCopy<KeyColors>>,
    colors: KeyColors,
) -> Result<(), String> {
    file.write_and_save(&conn, &colors, |kb| kb.set_key_colors(&colors))
}

pub fn run() {
    tauri::Builder::default()
        .manage(Connection::default())
        .setup(|app| {
            let dir = app.path().app_data_dir()?;
            app.manage(SavedCopy::<Keymap>::new(dir.join("keymap.json")));
            app.manage(SavedCopy::<KeyColors>::new(dir.join("key_colors.json")));
            Ok(())
        })
        .invoke_handler(tauri::generate_handler![
            layout,
            device_info,
            get_led,
            set_led,
            get_key_trigger,
            set_trigger,
            calibrate_key,
            get_keymap,
            factory_keymap,
            set_keymap,
            get_key_colors,
            set_key_colors
        ])
        .run(tauri::generate_context!())
        .expect("failed to start BoyiLin66");
}

#[cfg(test)]
mod tests {
    use super::*;
    use boyi_protocol::keymap::KeyAction;

    fn dir(name: &str) -> PathBuf {
        let d = std::env::temp_dir().join(format!("boyilin66-test-{name}-{}", std::process::id()));
        let _ = fs::remove_dir_all(&d);
        d
    }

    #[test]
    fn missing_copy_means_factory() {
        let file = SavedCopy::<Keymap>::new(dir("missing").join("keymap.json"));
        assert_eq!(file.load().unwrap(), Keymap::factory());
    }

    #[test]
    fn key_colors_copy_defaults_to_white_and_needs_every_slot() {
        let d = dir("colors");
        let file = SavedCopy::<KeyColors>::new(d.join("key_colors.json"));
        assert_eq!(file.load().unwrap(), KeyColors::uniform([0xff; 3]));
        fs::create_dir_all(&d).unwrap();
        fs::write(&file.0, b"[[1,2,3]]").unwrap();
        assert!(file.load().is_err());
        fs::remove_dir_all(&d).unwrap();
    }

    #[test]
    fn corrupt_or_invalid_copies_are_errors() {
        let d = dir("invalid");
        fs::create_dir_all(&d).unwrap();
        let file = SavedCopy::<Keymap>::new(d.join("keymap.json"));
        fs::write(&file.0, b"{not json").unwrap();
        assert!(file.load().is_err());
        let mut no_fn: Vec<KeyAction> = Keymap::factory().into();
        no_fn
            .iter_mut()
            .filter(|a| **a == KeyAction::Fn)
            .for_each(|a| *a = KeyAction::Disabled);
        fs::write(&file.0, serde_json::to_vec(&no_fn).unwrap()).unwrap();
        assert!(file.load().is_err());
        fs::remove_dir_all(&d).unwrap();
    }

    #[test]
    fn staged_copy_becomes_current_only_on_commit() {
        let d = dir("stage");
        let file = SavedCopy::<Keymap>::new(d.join("keymap.json"));
        let mut map = Keymap::factory();
        map.set(
            boyi_protocol::layout::KeyPos { row: 3, col: 0 },
            KeyAction::Key { usage: 0xe0 },
        )
        .unwrap();
        let staged = file.stage(&map).unwrap();
        assert_eq!(file.load().unwrap(), Keymap::factory());
        file.commit(&staged).unwrap();
        assert_eq!(file.load().unwrap(), map);
        fs::remove_dir_all(&d).unwrap();
    }

    #[test]
    fn staging_into_an_unwritable_place_fails() {
        let d = dir("unwritable");
        fs::create_dir_all(&d).unwrap();
        // A regular file where the data directory should be.
        fs::write(d.join("blocker"), b"").unwrap();
        let file = SavedCopy::<Keymap>::new(d.join("blocker").join("keymap.json"));
        assert!(file.stage(&Keymap::factory()).is_err());
        fs::remove_dir_all(&d).unwrap();
    }
}
