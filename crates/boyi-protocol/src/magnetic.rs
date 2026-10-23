//! Hall effect switch settings (command `0x21`).
//!
//! Every request declares length `0x18` and starts with a sub-command.
//! Distances are in units of 0.1 mm.

use serde::{Deserialize, Serialize};

use crate::frame::Frame;
use crate::layout::{KeyPos, COLS, ROWS};
use crate::{Error, Result};

pub const CMD: u8 = 0x21;
const LEN: u8 = 0x18;
const SUB_QUERY_KEY: u8 = 0x05;
/// In the mode byte's place: puts the masked keys in calibration mode; an empty mask leaves it.
const SUB_CALIBRATION_KEYS: u8 = 0x02;
const SUB_CALIBRATE: u8 = 0x07;
/// The per-key reply declares 4 payload bytes but carries 6; only the declared part is checked.
pub(crate) const KEY_REPLY_LEN: usize = 4;

const MODE_SEPARATE: u8 = 0x01;
const MODE_QUICK_TRIGGER: u8 = 0x0c;

/// Largest distance the firmware accepts, 4.0 mm (the full key travel).
pub const MAX_TRAVEL: u8 = 40;

/// How one key actuates.
#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
pub struct TriggerSettings {
    /// Depth at which the key registers.
    pub press: u8,
    /// Depth at which the key releases. Equal to `press` unless `separate` is set.
    pub release: u8,
    /// Use `release` instead of `press` for the release point.
    pub separate: bool,
    /// Quick Trigger: re-actuate after moving this far, regardless of depth.
    pub quick_trigger: bool,
    pub qt_press: u8,
    pub qt_release: u8,
}

/// The settings a key currently holds.
pub type KeyTrigger = TriggerSettings;

impl TriggerSettings {
    fn mode(&self) -> u8 {
        let mut m = 0;
        if self.separate {
            m |= MODE_SEPARATE;
        }
        if self.quick_trigger {
            m |= MODE_QUICK_TRIGGER;
        }
        m
    }
}

pub(crate) fn query_key_frame(key: KeyPos) -> Frame {
    Frame::new(CMD, 0, LEN, &[SUB_QUERY_KEY, key.row, key.col])
}

pub(crate) fn parse_key(reply: &Frame) -> Result<KeyTrigger> {
    let p = reply.payload();
    if p[0] != SUB_QUERY_KEY {
        return Err(Error::BadReply {
            cmd: CMD,
            reason: "reply is for another sub-command",
        });
    }
    // Payload length is declared as 4 but the firmware sends all six bytes.
    let raw = &reply.0[6..12];
    Ok(TriggerSettings {
        separate: raw[1] & MODE_SEPARATE != 0,
        quick_trigger: raw[1] & MODE_QUICK_TRIGGER == MODE_QUICK_TRIGGER,
        press: raw[2],
        release: raw[3],
        qt_press: raw[4],
        qt_release: raw[5],
    })
}

/// One column byte per matrix column; bit `n` selects row `n`.
fn key_mask(keys: &[KeyPos]) -> Result<[u8; COLS as usize]> {
    let mut mask = [0u8; COLS as usize];
    for k in keys {
        if k.row >= ROWS || k.col >= COLS {
            return Err(Error::OutOfRange("key position"));
        }
        mask[k.col as usize] |= 1 << k.row;
    }
    Ok(mask)
}

pub(crate) fn apply_frame(keys: &[KeyPos], s: &TriggerSettings) -> Result<Frame> {
    if keys.is_empty() {
        return Err(Error::OutOfRange("no keys selected"));
    }
    for (v, name) in [
        (s.press, "press"),
        (s.release, "release"),
        (s.qt_press, "qt_press"),
        (s.qt_release, "qt_release"),
    ] {
        if v == 0 || v > MAX_TRAVEL {
            return Err(Error::OutOfRange(name));
        }
    }
    let release = if s.separate { s.release } else { s.press };
    let mut payload = vec![s.mode()];
    payload.extend_from_slice(&key_mask(keys)?);
    payload.extend_from_slice(&[s.press, release, s.qt_press, s.qt_release]);
    Ok(Frame::new(CMD, 0, LEN, &payload))
}

/// Marks `keys` for calibration, or with no keys leaves calibration mode.
pub(crate) fn calibration_keys_frame(keys: &[KeyPos]) -> Result<Frame> {
    let mut payload = vec![SUB_CALIBRATION_KEYS];
    payload.extend_from_slice(&key_mask(keys)?);
    Ok(Frame::new(CMD, 0, LEN, &payload))
}

/// Starts calibrating `key`. The reply and a later unsolicited frame carry
/// `07 status`, see [`calibration_status`].
pub(crate) fn calibrate_frame(key: KeyPos) -> Frame {
    Frame::new(CMD, 0, LEN, &[SUB_CALIBRATE, key.row, key.col])
}

/// `Some(true)` done, `Some(false)` failed, `None` still running or not a calibration frame.
pub(crate) fn calibration_status(reply: &Frame) -> Option<bool> {
    match reply.payload() {
        [SUB_CALIBRATE, 0, ..] => Some(true),
        [SUB_CALIBRATE, 2, ..] => Some(false),
        _ => None,
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    const DEFAULT: TriggerSettings = TriggerSettings {
        press: 10,
        release: 10,
        separate: false,
        quick_trigger: false,
        qt_press: 5,
        qt_release: 5,
    };

    #[test]
    fn apply_matches_hardware_test() {
        let s = TriggerSettings {
            press: 15,
            release: 15,
            ..DEFAULT
        };
        let f = apply_frame(&[KeyPos { row: 1, col: 1 }], &s).unwrap();
        let mut expected = vec![0x01, 0x21, 0, 0, 0, 0x18, 0x00, 0x00, 0x02];
        expected.extend([0; 20]);
        expected.extend([15, 15, 5, 5]);
        assert_eq!(&f.0[..expected.len()], &expected[..]);
    }

    #[test]
    fn calibration_matches_hardware_test() {
        let caps = KeyPos { row: 3, col: 0 };
        let f = calibration_keys_frame(&[caps]).unwrap();
        assert_eq!(&f.0[..8], &[0x01, 0x21, 0, 0, 0, 0x18, 0x02, 0x08]);
        assert!(calibration_keys_frame(&[]).unwrap().0[7..]
            .iter()
            .all(|&b| b == 0));
        assert_eq!(
            &calibrate_frame(caps).0[..9],
            &[0x01, 0x21, 0, 0, 0, 0x18, 0x07, 3, 0]
        );
        let reply = |b: &[u8]| Frame::new(CMD, 0, b.len() as u8, b);
        assert_eq!(calibration_status(&reply(&[0x07, 0x01])), None);
        assert_eq!(calibration_status(&reply(&[0x07, 0x00])), Some(true));
        assert_eq!(calibration_status(&reply(&[0x07, 0x02])), Some(false));
        assert_eq!(calibration_status(&reply(&[0x00])), None);
    }

    #[test]
    fn mode_bits() {
        assert_eq!(DEFAULT.mode(), 0x00);
        assert_eq!(
            TriggerSettings {
                separate: true,
                ..DEFAULT
            }
            .mode(),
            0x01
        );
        assert_eq!(
            TriggerSettings {
                quick_trigger: true,
                ..DEFAULT
            }
            .mode(),
            0x0c
        );
        assert_eq!(
            TriggerSettings {
                separate: true,
                quick_trigger: true,
                ..DEFAULT
            }
            .mode(),
            0x0d
        );
    }

    #[test]
    fn release_follows_press_unless_separate() {
        let s = TriggerSettings {
            press: 12,
            release: 30,
            ..DEFAULT
        };
        assert_eq!(
            apply_frame(&[KeyPos { row: 1, col: 0 }], &s).unwrap().0[29..31],
            [12, 12]
        );
    }

    #[test]
    fn parses_captured_reply() {
        let mut f = Frame::new(CMD, 0, 4, &[0x05, 0x00, 0x0a, 0x0a]);
        f.0[10] = 5;
        f.0[11] = 5;
        assert_eq!(parse_key(&f).unwrap(), DEFAULT);
    }

    #[test]
    fn rejects_bad_input() {
        assert!(apply_frame(&[], &DEFAULT).is_err());
        assert!(apply_frame(&[KeyPos { row: 6, col: 0 }], &DEFAULT).is_err());
        assert!(apply_frame(
            &[KeyPos { row: 1, col: 0 }],
            &TriggerSettings {
                press: 41,
                ..DEFAULT
            }
        )
        .is_err());
        assert!(apply_frame(
            &[KeyPos { row: 1, col: 0 }],
            &TriggerSettings {
                press: 0,
                ..DEFAULT
            }
        )
        .is_err());
    }
}
