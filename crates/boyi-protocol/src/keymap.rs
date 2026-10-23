//! Key assignments (command `0x18`).
//!
//! The firmware takes a whole layer at once: every matrix slot in row-major
//! order, 4 bytes per slot, 14 slots per packet, 10 packets. There is no
//! command to read a layer back, so callers must keep their own copy.
//!
//! Only the base layer is written. The Fn layer holds factory functions
//! (media, lighting controls) whose encoding is not mapped yet, and writing a
//! layer replaces all of it.

use serde::{Deserialize, Serialize};

use crate::frame::Frame;
use crate::layout::{KeyPos, KEYS, SLOTS};
use crate::{Error, Result};

pub const CMD: u8 = 0x18;
const BASE_LAYER: u8 = 0;
const SLOTS_PER_PACKET: usize = 14;
const ENTRY: usize = 4;

const KIND_KEY: u8 = 0x00;
const KIND_FN: u8 = 0x01;
const KIND_MEDIA: u8 = 0x07;
const KIND_MOUSE: u8 = 0x12;
const KIND_SHORTCUT: u8 = 0x13;

/// First and last HID usages of the modifier keys (Left Ctrl … Right GUI).
const MODIFIER_FIRST: u8 = 0xe0;
const MODIFIER_LAST: u8 = 0xe7;
const MAX_SHORTCUT_MODIFIERS: u32 = 2;

/// Media and system keys, with the codes the firmware uses for them.
#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
pub enum MediaKey {
    VolumeUp,
    VolumeDown,
    Mute,
    PlayPause,
    NextTrack,
    PreviousTrack,
    Stop,
    MediaPlayer,
    Calculator,
    Computer,
    Email,
    Browser,
    Search,
    BrightnessUp,
    BrightnessDown,
}

impl MediaKey {
    fn code(self) -> u8 {
        match self {
            Self::VolumeUp => 0x10,
            Self::VolumeDown => 0x11,
            Self::Mute => 0x12,
            Self::PlayPause => 0x13,
            Self::NextTrack => 0x14,
            Self::PreviousTrack => 0x15,
            Self::Stop => 0x16,
            Self::MediaPlayer => 0x17,
            Self::Calculator => 0x30,
            Self::Computer => 0x32,
            Self::Email => 0x34,
            Self::Browser => 0x23,
            Self::Search => 0x20,
            Self::BrightnessUp => 0x38,
            Self::BrightnessDown => 0x39,
        }
    }
}

/// Mouse buttons and wheel steps a key can send.
#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
pub enum MouseAction {
    Left,
    Right,
    Middle,
    Back,
    Forward,
    ScrollUp,
    ScrollDown,
}

impl MouseAction {
    /// `(is_wheel, value)`: a button bit mask, or a signed wheel step.
    fn encode(self) -> (u8, u8) {
        match self {
            Self::Left => (0, 0x01),
            Self::Right => (0, 0x02),
            Self::Middle => (0, 0x04),
            Self::Back => (0, 0x08),
            Self::Forward => (0, 0x10),
            Self::ScrollUp => (1, 0x01),
            Self::ScrollDown => (1, 0xff),
        }
    }
}

/// What a key does when pressed.
#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
#[serde(tag = "kind", rename_all = "snake_case")]
pub enum KeyAction {
    Disabled,
    /// A HID keyboard usage, modifiers (`0xE0`–`0xE7`) included.
    Key {
        usage: u8,
    },
    /// The Fn layer switch.
    Fn,
    /// One or two modifiers held together with a key, e.g. Ctrl+C.
    /// `modifiers` is a HID modifier bit mask (bit 0 = Left Ctrl … bit 7 = Right GUI).
    Shortcut {
        modifiers: u8,
        usage: u8,
    },
    Media {
        key: MediaKey,
    },
    Mouse {
        action: MouseAction,
    },
}

impl KeyAction {
    fn encode(self) -> Result<[u8; ENTRY]> {
        Ok(match self {
            Self::Disabled => [KIND_KEY, 0, 0, 0],
            Self::Key { usage } => {
                if usage == 0 {
                    return Err(Error::OutOfRange("key usage"));
                }
                [KIND_KEY, usage, 0, 0]
            }
            Self::Fn => [KIND_FN, 0, 0, 0],
            Self::Shortcut { modifiers, usage } => {
                let count = modifiers.count_ones();
                if count == 0 || count > MAX_SHORTCUT_MODIFIERS {
                    return Err(Error::OutOfRange("shortcut needs one or two modifiers"));
                }
                if usage == 0 || (MODIFIER_FIRST..=MODIFIER_LAST).contains(&usage) {
                    return Err(Error::OutOfRange("shortcut key"));
                }
                let mut mods = (0..8)
                    .filter(|bit| modifiers & (1 << bit) != 0)
                    .map(|bit| MODIFIER_FIRST + bit);
                match (mods.next(), mods.next()) {
                    (Some(a), None) => [KIND_SHORTCUT, a, usage, 0],
                    (Some(a), Some(b)) => [KIND_SHORTCUT, a, b, usage],
                    _ => unreachable!("count checked above"),
                }
            }
            Self::Media { key } => [KIND_MEDIA, key.code(), 0, 0],
            Self::Mouse { action } => {
                let (wheel, value) = action.encode();
                [KIND_MOUSE, wheel, value, 0]
            }
        })
    }
}

/// One action per matrix slot, in row-major order.
#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
#[serde(try_from = "Vec<KeyAction>", into = "Vec<KeyAction>")]
pub struct Keymap(Vec<KeyAction>);

impl Keymap {
    /// The factory base layer.
    pub fn factory() -> Self {
        let mut slots = vec![KeyAction::Disabled; SLOTS];
        for key in &KEYS {
            slots[key.pos.index()] = match key.usage {
                Some(usage) => KeyAction::Key { usage },
                None => KeyAction::Fn,
            };
        }
        Self(slots)
    }

    pub fn get(&self, pos: KeyPos) -> Option<KeyAction> {
        self.0.get(pos.index()).copied()
    }

    pub fn set(&mut self, pos: KeyPos, action: KeyAction) -> Result<()> {
        let slot = self
            .0
            .get_mut(pos.index())
            .ok_or(Error::OutOfRange("key position"))?;
        *slot = action;
        Ok(())
    }

    /// Fails if no slot keeps the Fn key, which would lock the user out of
    /// Fn shortcuts until the next write.
    fn check(&self) -> Result<()> {
        if !self.0.contains(&KeyAction::Fn) {
            return Err(Error::OutOfRange("keymap must keep an Fn key"));
        }
        Ok(())
    }
}

impl TryFrom<Vec<KeyAction>> for Keymap {
    type Error = String;

    fn try_from(slots: Vec<KeyAction>) -> std::result::Result<Self, String> {
        if slots.len() != SLOTS {
            return Err(format!("keymap needs {SLOTS} slots, got {}", slots.len()));
        }
        Ok(Self(slots))
    }
}

impl From<Keymap> for Vec<KeyAction> {
    fn from(map: Keymap) -> Self {
        map.0
    }
}

/// The ten packets that write `map` as the base layer.
pub(crate) fn write_frames(map: &Keymap) -> Result<Vec<Frame>> {
    map.check()?;
    let entries = map
        .0
        .iter()
        .map(|a| a.encode())
        .collect::<Result<Vec<_>>>()?;
    Ok(entries
        .chunks(SLOTS_PER_PACKET)
        .enumerate()
        .map(|(index, chunk)| {
            let payload: Vec<u8> = chunk.iter().flatten().copied().collect();
            Frame::new(CMD, BASE_LAYER, payload.len() as u8, &payload).with_index(index as u8)
        })
        .collect())
}

#[cfg(test)]
mod tests {
    use super::*;

    const CAPS: KeyPos = KeyPos { row: 3, col: 0 };

    #[test]
    fn factory_layer_matches_hardware_test() {
        let frames = write_frames(&Keymap::factory()).unwrap();
        assert_eq!(frames.len(), 10);
        assert!(frames[..9].iter().all(|f| f.payload().len() == 56));
        assert_eq!(frames[9].payload().len(), 24);
        // Packet 1 starts at slot 14; Esc is slot 22 → entry 8.
        assert_eq!(&frames[1].0[..6], &[0x01, 0x18, 0x00, 0x00, 0x01, 56]);
        assert_eq!(&frames[1].payload()[32..36], &[0x00, 0x29, 0, 0]);
        // Fn at slot 122 → packet 8, entry 10.
        assert_eq!(&frames[8].payload()[40..44], &[0x01, 0, 0, 0]);
    }

    #[test]
    fn caps_to_ctrl_matches_hardware_test() {
        let mut map = Keymap::factory();
        map.set(CAPS, KeyAction::Key { usage: 0xe0 }).unwrap();
        // Caps is slot 66 → packet 4, entry 10.
        assert_eq!(
            &write_frames(&map).unwrap()[4].payload()[40..44],
            &[0x00, 0xe0, 0, 0]
        );
    }

    #[test]
    fn encodings() {
        let enc = |a: KeyAction| a.encode().unwrap();
        assert_eq!(
            enc(KeyAction::Shortcut {
                modifiers: 0x01,
                usage: 0x06
            }),
            [0x13, 0xe0, 0x06, 0]
        );
        assert_eq!(
            enc(KeyAction::Shortcut {
                modifiers: 0x05,
                usage: 0x3d
            }),
            [0x13, 0xe0, 0xe2, 0x3d]
        );
        assert_eq!(
            enc(KeyAction::Media {
                key: MediaKey::VolumeUp
            }),
            [0x07, 0x10, 0, 0]
        );
        assert_eq!(
            enc(KeyAction::Mouse {
                action: MouseAction::Left
            }),
            [0x12, 0, 0x01, 0]
        );
        assert_eq!(
            enc(KeyAction::Mouse {
                action: MouseAction::ScrollDown
            }),
            [0x12, 1, 0xff, 0]
        );
    }

    #[test]
    fn rejects_bad_maps() {
        let mut no_fn = Keymap::factory();
        no_fn
            .set(KeyPos { row: 5, col: 12 }, KeyAction::Disabled)
            .unwrap();
        assert!(write_frames(&no_fn).is_err());
        assert!(KeyAction::Shortcut {
            modifiers: 0x07,
            usage: 0x04
        }
        .encode()
        .is_err());
        assert!(KeyAction::Shortcut {
            modifiers: 0,
            usage: 0x04
        }
        .encode()
        .is_err());
        assert!(KeyAction::Shortcut {
            modifiers: 1,
            usage: 0xe1
        }
        .encode()
        .is_err());
        assert!(KeyAction::Key { usage: 0 }.encode().is_err());
        assert!(Keymap::try_from(vec![KeyAction::Disabled; 10]).is_err());
    }

    #[test]
    fn json_round_trip() {
        let mut map = Keymap::factory();
        map.set(
            CAPS,
            KeyAction::Media {
                key: MediaKey::Mute,
            },
        )
        .unwrap();
        let json = serde_json::to_string(&map).unwrap();
        assert!(json.contains(r#"{"kind":"media","key":"Mute"}"#));
        assert_eq!(serde_json::from_str::<Keymap>(&json).unwrap(), map);
    }
}
