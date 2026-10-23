//! Key assignments (command `0x18`).
//!
//! The firmware takes a whole layer at once: every matrix slot in row-major
//! order, 4 bytes per slot, 14 slots per packet, 10 packets. There is no
//! command to read a layer back, so callers must keep their own copy.
//!
//! Only the base layer is written. The Fn layer holds factory functions
//! (media, lighting controls) whose encoding is not mapped yet, and writing a
//! layer replaces all of it.
//!
//! Macros and advanced keys (Mod-Tap, Toggle, DKS) live in separate firmware
//! slots; the keymap entry only points at a slot. [`write_frames`] assigns the
//! slots and sends them before the layer, so a keymap is always written whole.

use serde::{Deserialize, Serialize};

use crate::advanced::{self, AdvancedKey};
use crate::frame::Frame;
use crate::layout::{KeyPos, KEYS, SLOTS};
use crate::macros::{self, Macro};
use crate::{Error, Result};

pub const CMD: u8 = 0x18;
const BASE_LAYER: u8 = 0;
const SLOTS_PER_PACKET: usize = 14;
const ENTRY: usize = 4;

const KIND_KEY: u8 = 0x00;
const KIND_FN: u8 = 0x01;
const KIND_MEDIA: u8 = 0x07;
const KIND_MACRO: u8 = 0x10;
const KIND_MOUSE: u8 = 0x12;
const KIND_SHORTCUT: u8 = 0x13;
const KIND_ADVANCED: u8 = 0x17;

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

/// A key or a shortcut: what advanced keys can send.
#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
#[serde(tag = "kind", rename_all = "snake_case")]
pub enum KeyStroke {
    /// A HID keyboard usage, modifiers (`0xE0`–`0xE7`) included.
    Key { usage: u8 },
    /// One or two modifiers held together with a key, e.g. Ctrl+C.
    /// `modifiers` is a HID modifier bit mask (bit 0 = Left Ctrl … bit 7 = Right GUI).
    Shortcut { modifiers: u8, usage: u8 },
}

impl KeyStroke {
    pub(crate) fn encode(self) -> Result<[u8; ENTRY]> {
        Ok(match self {
            Self::Key { usage } => {
                if usage == 0 {
                    return Err(Error::OutOfRange("key usage"));
                }
                [KIND_KEY, usage, 0, 0]
            }
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
        })
    }
}

/// What a key does when pressed.
#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
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
    /// Mod-Tap, Toggle or DKS; stored in one of the firmware's advanced-key slots.
    Advanced {
        key: AdvancedKey,
    },
    /// Plays a macro; stored in one of the firmware's macro slots.
    Macro(Macro),
}

impl KeyAction {
    /// `slot` is the advanced-key or macro slot this entry was given, if it is one.
    fn encode(&self, slot: Option<u8>) -> Result<[u8; ENTRY]> {
        Ok(match *self {
            Self::Disabled => [KIND_KEY, 0, 0, 0],
            Self::Key { usage } => KeyStroke::Key { usage }.encode()?,
            Self::Fn => [KIND_FN, 0, 0, 0],
            Self::Shortcut { modifiers, usage } => {
                KeyStroke::Shortcut { modifiers, usage }.encode()?
            }
            Self::Media { key } => [KIND_MEDIA, key.code(), 0, 0],
            Self::Mouse { action } => {
                let (wheel, value) = action.encode();
                [KIND_MOUSE, wheel, value, 0]
            }
            Self::Advanced { .. } => [
                KIND_ADVANCED,
                slot.expect("advanced entries get a slot"),
                0,
                0,
            ],
            Self::Macro(_) => [KIND_MACRO, 0, slot.expect("macro entries get a slot"), 0],
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

    /// The action at `pos`, or `None` outside the matrix.
    pub fn get(&self, pos: KeyPos) -> Option<KeyAction> {
        pos.in_matrix().then(|| self.0[pos.index()].clone())
    }

    pub fn set(&mut self, pos: KeyPos, action: KeyAction) -> Result<()> {
        if !pos.in_matrix() {
            return Err(Error::OutOfRange("key position"));
        }
        self.0[pos.index()] = action;
        Ok(())
    }

    /// Checks everything [`Keyboard::write_keymap`](crate::Keyboard::write_keymap)
    /// would reject, without touching the device.
    pub fn validate(&self) -> Result<()> {
        write_frames(self).map(drop)
    }

    /// Structural rules: exactly one Fn, and only physical keys assigned. A
    /// missing Fn would lock the user out of Fn shortcuts until the next write.
    fn check(&self) -> Result<()> {
        let mut fn_keys = 0;
        for (index, action) in self.0.iter().enumerate() {
            let physical = KEYS.iter().any(|k| k.pos.index() == index);
            if !physical && action != &KeyAction::Disabled {
                return Err(Error::OutOfRange("only physical keys can be assigned"));
            }
            fn_keys += usize::from(action == &KeyAction::Fn);
        }
        if fn_keys != 1 {
            return Err(Error::OutOfRange("keymap must have exactly one Fn key"));
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
        let map = Self(slots);
        map.validate().map_err(|e| e.to_string())?;
        Ok(map)
    }
}

impl From<Keymap> for Vec<KeyAction> {
    fn from(map: Keymap) -> Self {
        map.0
    }
}

/// Every packet that writes `map`: all macro and advanced-key slots (unused
/// ones emptied), then the ten base-layer packets that refer to them.
pub(crate) fn write_frames(map: &Keymap) -> Result<Vec<Frame>> {
    map.check()?;
    let macros: Vec<&Macro> = map
        .0
        .iter()
        .filter_map(|a| match a {
            KeyAction::Macro(m) => Some(m),
            _ => None,
        })
        .collect();
    if macros.len() > macros::SLOTS {
        return Err(Error::OutOfRange("at most 10 macro keys"));
    }
    let advanced: Vec<&AdvancedKey> = map
        .0
        .iter()
        .filter_map(|a| match a {
            KeyAction::Advanced { key } => Some(key),
            _ => None,
        })
        .collect();
    if advanced.len() > advanced::SLOTS {
        return Err(Error::OutOfRange("at most 40 advanced keys"));
    }
    let mut frames = Vec::new();
    for slot in 0..macros::SLOTS {
        frames.extend(macros::slot_frames(slot as u8, macros.get(slot).copied())?);
    }
    for slot in 0..advanced::SLOTS {
        frames.push(advanced::slot_frame(
            slot as u8,
            advanced.get(slot).copied(),
        )?);
    }

    // Slots are handed out in matrix order, the same order used above.
    let (mut next_advanced, mut next_macro) = (0u8, 0u8);
    let mut entries = Vec::with_capacity(SLOTS);
    for action in &map.0 {
        let next = match action {
            KeyAction::Advanced { .. } => Some(&mut next_advanced),
            KeyAction::Macro(_) => Some(&mut next_macro),
            _ => None,
        };
        let slot = next.map(|n| {
            *n += 1;
            *n - 1
        });
        entries.push(action.encode(slot)?);
    }
    frames.extend(
        entries
            .chunks(SLOTS_PER_PACKET)
            .enumerate()
            .map(|(index, chunk)| {
                let payload: Vec<u8> = chunk.iter().flatten().copied().collect();
                Frame::new(CMD, BASE_LAYER, payload.len() as u8, &payload).with_index(index as u8)
            }),
    );
    Ok(frames)
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::advanced::{DksBinding, DksPoints, StageAction};
    use crate::macros::{MacroStep, Playback};

    const CAPS: KeyPos = KeyPos { row: 3, col: 0 };
    const A: KeyStroke = KeyStroke::Key { usage: 0x04 };
    const B: KeyStroke = KeyStroke::Key { usage: 0x05 };

    const MACRO_FRAMES: usize = macros::SLOTS * macros::PACKETS;

    /// The ten base-layer packets, after the macro and advanced-key slots.
    fn layer(map: &Keymap) -> Vec<Frame> {
        write_frames(map)
            .unwrap()
            .split_off(MACRO_FRAMES + advanced::SLOTS)
    }

    fn tap_macro(usage: u8) -> KeyAction {
        let step = |down| MacroStep {
            usage,
            down,
            delay_ms: 10,
        };
        KeyAction::Macro(Macro {
            playback: Playback::Once,
            steps: vec![step(true), step(false)],
        })
    }

    fn enc(a: KeyAction) -> [u8; ENTRY] {
        a.encode(None).unwrap()
    }

    #[test]
    fn factory_layer_matches_hardware_test() {
        let all = write_frames(&Keymap::factory()).unwrap();
        assert_eq!(all.len(), MACRO_FRAMES + advanced::SLOTS + 10);
        let empty = |f: &Frame, cmd| f.cmd() == cmd && f.0[6..].iter().all(|&b| b == 0);
        assert!(all[..MACRO_FRAMES].iter().all(|f| empty(f, macros::CMD)));
        assert!(all[MACRO_FRAMES..][..advanced::SLOTS]
            .iter()
            .all(|f| empty(f, advanced::CMD)));
        let frames = layer(&Keymap::factory());
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
        assert_eq!(&layer(&map)[4].payload()[40..44], &[0x00, 0xe0, 0, 0]);
    }

    #[test]
    fn advanced_keys_get_slots_in_matrix_order() {
        let mut map = Keymap::factory();
        let toggle = AdvancedKey::Toggle { key: A };
        let mod_tap = AdvancedKey::ModTap {
            hold: A,
            tap: B,
            hold_ms: 200,
        };
        map.set(CAPS, KeyAction::Advanced { key: mod_tap }).unwrap();
        map.set(
            KeyPos { row: 1, col: 0 },
            KeyAction::Advanced { key: toggle },
        )
        .unwrap();
        let all = write_frames(&map).unwrap().split_off(MACRO_FRAMES);
        // Esc (slot 22) comes before Caps (slot 66), so it takes advanced slot 0.
        assert_eq!(&all[0].0[6..8], &[0x03, 0x00]);
        assert_eq!(&all[1].0[6..8], &[0x02, 0x00]);
        assert!(all[2].0[6..].iter().all(|&b| b == 0));
        let frames = layer(&map);
        assert_eq!(&frames[1].payload()[32..36], &[0x17, 0, 0, 0]);
        assert_eq!(&frames[4].payload()[40..44], &[0x17, 1, 0, 0]);
    }

    #[test]
    fn rejects_more_than_40_advanced_keys() {
        let mut map = Keymap::factory();
        let toggle = KeyAction::Advanced {
            key: AdvancedKey::Toggle { key: A },
        };
        for key in KEYS.iter().filter(|k| k.usage.is_some()).take(41) {
            map.set(key.pos, toggle.clone()).unwrap();
        }
        assert!(write_frames(&map).is_err());
    }

    #[test]
    fn macro_keys_get_slots_in_matrix_order() {
        let mut map = Keymap::factory();
        map.set(CAPS, tap_macro(0x68)).unwrap();
        map.set(KeyPos { row: 1, col: 0 }, tap_macro(0x69)).unwrap();
        let all = write_frames(&map).unwrap();
        // Esc (slot 22) comes before Caps (slot 66), so it takes macro slot 0.
        assert_eq!(
            &all[0].0[..16],
            &[1, 0x19, 0, 0, 0, 0x3a, 0, 0, 0, 8, 0, 1, 0, 0, 0x69, 0x10]
        );
        assert_eq!(
            &all[macros::PACKETS].0[..16],
            &[1, 0x19, 1, 0, 0, 0x3a, 0, 0, 0, 8, 0, 1, 0, 0, 0x68, 0x10]
        );
        assert!(all[2 * macros::PACKETS..MACRO_FRAMES]
            .iter()
            .all(|f| f.0[6..].iter().all(|&b| b == 0)));
        let frames = layer(&map);
        // Matches the hardware tests: `10 00 slot 00`.
        assert_eq!(&frames[1].payload()[32..36], &[0x10, 0, 0, 0]);
        assert_eq!(&frames[4].payload()[40..44], &[0x10, 0, 1, 0]);
    }

    #[test]
    fn rejects_more_than_10_macro_keys() {
        let mut map = Keymap::factory();
        for key in KEYS.iter().filter(|k| k.usage.is_some()).take(11) {
            map.set(key.pos, tap_macro(0x68)).unwrap();
        }
        assert!(write_frames(&map).is_err());
    }

    #[test]
    fn encodings() {
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
                key: MediaKey::Mute
            }),
            [0x07, 0x12, 0, 0]
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
        let bad = |a: KeyAction| a.encode(None).is_err();
        assert!(bad(KeyAction::Shortcut {
            modifiers: 0x07,
            usage: 0x04
        }));
        assert!(bad(KeyAction::Shortcut {
            modifiers: 0,
            usage: 0x04
        }));
        assert!(bad(KeyAction::Shortcut {
            modifiers: 1,
            usage: 0xe1
        }));
        assert!(bad(KeyAction::Key { usage: 0 }));
        assert!(Keymap::try_from(vec![KeyAction::Disabled; 10]).is_err());
    }

    #[test]
    fn requires_exactly_one_fn_on_a_physical_key() {
        let mut two_fn = Keymap::factory();
        two_fn.set(CAPS, KeyAction::Fn).unwrap();
        assert!(two_fn.validate().is_err());

        let mut moved = Keymap::factory();
        moved
            .set(KeyPos { row: 5, col: 12 }, KeyAction::Disabled)
            .unwrap();
        moved.set(CAPS, KeyAction::Fn).unwrap();
        assert!(moved.validate().is_ok());

        // (0, 0) has no physical key.
        let mut ghost = Keymap::factory();
        ghost
            .set(KeyPos { row: 5, col: 12 }, KeyAction::Disabled)
            .unwrap();
        ghost.set(KeyPos { row: 0, col: 0 }, KeyAction::Fn).unwrap();
        assert!(ghost.validate().is_err());
        let mut ghost_key = Keymap::factory();
        ghost_key
            .set(KeyPos { row: 0, col: 0 }, KeyAction::Key { usage: 4 })
            .unwrap();
        assert!(ghost_key.validate().is_err());
    }

    #[test]
    fn positions_outside_the_matrix_do_not_alias() {
        let mut map = Keymap::factory();
        let past_row_end = KeyPos { row: 1, col: 22 };
        assert_eq!(map.get(past_row_end), None);
        assert!(map.set(past_row_end, KeyAction::Disabled).is_err());
        assert_eq!(
            map.get(KeyPos { row: 2, col: 0 }),
            Some(KeyAction::Key { usage: 0x2b })
        );
        assert!(map
            .set(KeyPos { row: 6, col: 0 }, KeyAction::Disabled)
            .is_err());
    }

    #[test]
    fn deserializing_validates_the_map() {
        let mut no_fn: Vec<KeyAction> = Keymap::factory().into();
        no_fn[KeyPos { row: 5, col: 12 }.index()] = KeyAction::Disabled;
        let json = serde_json::to_string(&no_fn).unwrap();
        assert!(serde_json::from_str::<Keymap>(&json).is_err());
        let bad_usage = serde_json::to_string(&Keymap::factory()).unwrap().replacen(
            r#""usage":41"#,
            r#""usage":0"#,
            1,
        );
        assert!(serde_json::from_str::<Keymap>(&bad_usage).is_err());
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
        let dks = AdvancedKey::Dks {
            points: DksPoints::DEFAULT,
            bindings: [
                Some(DksBinding {
                    key: A,
                    stages: [StageAction::Tap; 4],
                }),
                None,
                None,
                None,
            ],
        };
        map.set(KeyPos { row: 1, col: 0 }, KeyAction::Advanced { key: dks })
            .unwrap();
        let json = serde_json::to_string(&map).unwrap();
        assert!(json.contains(r#"{"kind":"media","key":"Mute"}"#));
        assert!(json.contains(r#"{"kind":"advanced","key":{"type":"dks","points":{"press":15"#));
        assert_eq!(serde_json::from_str::<Keymap>(&json).unwrap(), map);
    }

    #[test]
    fn macro_json() {
        let json = r#"{"kind":"macro","playback":{"type":"repeat","count":3},
            "steps":[{"usage":104,"down":true,"delay_ms":300},{"usage":104,"down":false,"delay_ms":0}]}"#;
        let action: KeyAction = serde_json::from_str(json).unwrap();
        let KeyAction::Macro(m) = &action else {
            panic!("not a macro: {action:?}")
        };
        assert_eq!(m.playback, Playback::Repeat { count: 3 });
        assert_eq!(m.steps[0].delay_ms, 300);
        let back = serde_json::to_string(&action).unwrap();
        assert!(
            back.starts_with(r#"{"kind":"macro","playback":{"type":"repeat","count":3},"steps":["#)
        );
    }

    /// The advanced keys the frontend tests expect `set_keymap` to receive.
    #[test]
    fn parses_frontend_advanced_keys() {
        use StageAction::{Hold, None as N, Tap};
        let parse = |json| match serde_json::from_str::<KeyAction>(json).unwrap() {
            KeyAction::Advanced { key } => key,
            other => panic!("not advanced: {other:?}"),
        };
        assert_eq!(
            parse(
                r#"{"kind":"advanced","key":{"type":"mod_tap","tap":{"kind":"key","usage":57},
                "hold":{"kind":"shortcut","modifiers":3,"usage":29},"hold_ms":300}}"#
            ),
            AdvancedKey::ModTap {
                tap: KeyStroke::Key { usage: 0x39 },
                hold: KeyStroke::Shortcut {
                    modifiers: 3,
                    usage: 29
                },
                hold_ms: 300,
            }
        );
        assert_eq!(
            parse(r#"{"kind":"advanced","key":{"type":"toggle","key":{"kind":"key","usage":4}}}"#),
            AdvancedKey::Toggle { key: A }
        );
        assert_eq!(
            parse(
                r#"{"kind":"advanced","key":{"type":"dks",
                "points":{"press":20,"bottom":36,"bottom_release":36,"release":15},
                "bindings":[null,{"key":{"kind":"key","usage":5},"stages":["tap","hold","none","none"]},null,null]}}"#
            ),
            AdvancedKey::Dks {
                points: DksPoints {
                    press: 20,
                    ..DksPoints::DEFAULT
                },
                bindings: [
                    None,
                    Some(DksBinding {
                        key: B,
                        stages: [Tap, Hold, N, N],
                    }),
                    None,
                    None,
                ],
            }
        );
    }
}
