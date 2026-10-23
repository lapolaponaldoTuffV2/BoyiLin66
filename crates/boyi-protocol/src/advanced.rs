//! Advanced key functions (command `0x22`): Mod-Tap, Toggle and DKS.
//!
//! The firmware keeps 40 slots. A key uses one through its keymap entry, so
//! slots are written together with the keymap (see [`crate::keymap`]).

use serde::{Deserialize, Serialize};

use crate::frame::Frame;
use crate::keymap::KeyStroke;
use crate::magnetic::MAX_TRAVEL;
use crate::{Error, Result};

pub const CMD: u8 = 0x22;
pub const SLOTS: usize = 40;
const LEN: u8 = 0x32;

const TYPE_DKS: u8 = 1;
const TYPE_MOD_TAP: u8 = 2;
const TYPE_TOGGLE: u8 = 3;

/// The firmware stores the Mod-Tap hold time in units of 10 ms.
const HOLD_UNIT_MS: u16 = 10;

/// What a DKS binding does when the key crosses one stage.
#[derive(Debug, Clone, Copy, Default, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "snake_case")]
pub enum StageAction {
    #[default]
    None,
    /// Press and release at this stage.
    Tap,
    /// Press at this stage, release at the next one.
    Hold,
}

impl StageAction {
    fn code(self) -> u8 {
        match self {
            Self::None => 0,
            Self::Tap => 1,
            Self::Hold => 2,
        }
    }
}

/// Where the four DKS stages trigger, in 0.1 mm.
#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
pub struct DksPoints {
    /// Stage 1: the key goes down past this depth.
    pub press: u8,
    /// Stage 2: the key reaches this depth.
    pub bottom: u8,
    /// Stage 3: the key comes back up past this depth.
    pub bottom_release: u8,
    /// Stage 4: the key comes back up past this depth.
    pub release: u8,
}

impl DksPoints {
    /// 1.5 mm / 3.6 mm / 3.6 mm / 1.5 mm, as the official software sets them.
    pub const DEFAULT: Self = Self {
        press: 15,
        bottom: 36,
        bottom_release: 36,
        release: 15,
    };

    fn check(&self) -> Result<()> {
        let all = [self.press, self.bottom, self.bottom_release, self.release];
        if all.iter().any(|&p| p == 0 || p > MAX_TRAVEL) {
            return Err(Error::OutOfRange("DKS point"));
        }
        if self.press >= self.bottom || self.release >= self.bottom_release {
            return Err(Error::OutOfRange(
                "DKS press and release points must be above the bottom points",
            ));
        }
        Ok(())
    }
}

/// One of the four keys a DKS key can send, and when.
#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
pub struct DksBinding {
    pub key: KeyStroke,
    /// Stages 1–4: press, bottom, leaving the bottom, release.
    pub stages: [StageAction; 4],
}

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
#[serde(tag = "type", rename_all = "snake_case")]
pub enum AdvancedKey {
    /// Sends `tap` when tapped, holds `hold` when held longer than `hold_ms`.
    ModTap {
        hold: KeyStroke,
        tap: KeyStroke,
        hold_ms: u16,
    },
    /// First press holds `key` down, the next press releases it.
    Toggle { key: KeyStroke },
    /// Dynamic keystroke: up to four keys, each sent at chosen stages of the travel.
    Dks {
        points: DksPoints,
        bindings: [Option<DksBinding>; 4],
    },
}

impl AdvancedKey {
    fn payload(&self) -> Result<Vec<u8>> {
        let mut p = Vec::with_capacity(37);
        match *self {
            Self::ModTap { hold, tap, hold_ms } => {
                if hold_ms == 0
                    || hold_ms % HOLD_UNIT_MS != 0
                    || hold_ms / HOLD_UNIT_MS > u8::MAX as u16
                {
                    return Err(Error::OutOfRange(
                        "Mod-Tap hold time (10–2550 ms, steps of 10)",
                    ));
                }
                p.push(TYPE_MOD_TAP);
                p.extend(hold.encode()?);
                p.extend(tap.encode()?);
                p.push((hold_ms / HOLD_UNIT_MS) as u8);
            }
            Self::Toggle { key } => {
                p.push(TYPE_TOGGLE);
                p.extend(key.encode()?);
            }
            Self::Dks { points, bindings } => {
                points.check()?;
                if !bindings
                    .iter()
                    .flatten()
                    .any(|b| b.stages.iter().any(|&s| s != StageAction::None))
                {
                    return Err(Error::OutOfRange("DKS needs at least one stage action"));
                }
                p.push(TYPE_DKS);
                p.extend([
                    points.press,
                    points.bottom,
                    points.bottom_release,
                    points.release,
                ]);
                for binding in bindings {
                    match binding {
                        Some(b) => {
                            // Stage 4 is the last one: a hold there would never be released.
                            if b.stages[3] == StageAction::Hold {
                                return Err(Error::OutOfRange("DKS hold cannot start at release"));
                            }
                            p.extend(b.key.encode()?);
                            p.extend(b.stages.map(StageAction::code));
                        }
                        None => p.extend([0; 8]),
                    }
                }
            }
        }
        Ok(p)
    }
}

/// Writes `key` into `slot`, or empties the slot.
pub(crate) fn slot_frame(slot: u8, key: Option<&AdvancedKey>) -> Result<Frame> {
    let payload = match key {
        Some(k) => k.payload()?,
        None => vec![],
    };
    Ok(Frame::new(CMD, slot, LEN, &payload))
}

#[cfg(test)]
mod tests {
    use super::*;

    const A: KeyStroke = KeyStroke::Key { usage: 0x04 };
    const B: KeyStroke = KeyStroke::Key { usage: 0x05 };

    fn bytes(f: &Frame, n: usize) -> &[u8] {
        &f.0[6..6 + n]
    }

    #[test]
    fn mod_tap_matches_hardware_test() {
        let f = slot_frame(
            0,
            Some(&AdvancedKey::ModTap {
                hold: A,
                tap: B,
                hold_ms: 200,
            }),
        )
        .unwrap();
        assert_eq!(&f.0[..6], &[0x01, 0x22, 0x00, 0x00, 0x00, 0x32]);
        assert_eq!(bytes(&f, 10), &[0x02, 0, 0x04, 0, 0, 0, 0x05, 0, 0, 0x14]);
    }

    #[test]
    fn toggle_matches_hardware_test() {
        let f = slot_frame(3, Some(&AdvancedKey::Toggle { key: A })).unwrap();
        assert_eq!(f.0[2], 3);
        assert_eq!(bytes(&f, 5), &[0x03, 0, 0x04, 0, 0]);
    }

    #[test]
    fn dks_matches_hardware_test() {
        use StageAction::{None as N, Tap as T};
        let key = |usage| KeyStroke::Key { usage };
        let dks = AdvancedKey::Dks {
            points: DksPoints::DEFAULT,
            bindings: [
                Some(DksBinding {
                    key: key(0x04),
                    stages: [T, N, N, N],
                }),
                Some(DksBinding {
                    key: key(0x05),
                    stages: [N, T, N, N],
                }),
                Some(DksBinding {
                    key: key(0x06),
                    stages: [N, N, T, N],
                }),
                Some(DksBinding {
                    key: key(0x07),
                    stages: [N, N, N, T],
                }),
            ],
        };
        let expected = [
            0x01, 0x0f, 0x24, 0x24, 0x0f, // type, points
            0, 0x04, 0, 0, 1, 0, 0, 0, //
            0, 0x05, 0, 0, 0, 1, 0, 0, //
            0, 0x06, 0, 0, 0, 0, 1, 0, //
            0, 0x07, 0, 0, 0, 0, 0, 1,
        ];
        assert_eq!(
            bytes(&slot_frame(0, Some(&dks)).unwrap(), expected.len()),
            &expected
        );
    }

    #[test]
    fn empty_slot_is_all_zero() {
        let f = slot_frame(39, None).unwrap();
        assert_eq!(&f.0[..6], &[0x01, 0x22, 39, 0, 0, 0x32]);
        assert!(f.0[6..].iter().all(|&b| b == 0));
    }

    #[test]
    fn rejects_bad_settings() {
        let mt = |hold_ms| {
            AdvancedKey::ModTap {
                hold: A,
                tap: B,
                hold_ms,
            }
            .payload()
        };
        assert!(mt(0).is_err() && mt(205).is_err() && mt(2560).is_err());
        assert!(mt(2550).is_ok());

        let dks = |points, stages| {
            AdvancedKey::Dks {
                points,
                bindings: [Some(DksBinding { key: A, stages }), None, None, None],
            }
            .payload()
        };
        let tap = [
            StageAction::Tap,
            StageAction::None,
            StageAction::None,
            StageAction::None,
        ];
        assert!(dks(DksPoints::DEFAULT, tap).is_ok());
        assert!(dks(DksPoints::DEFAULT, [StageAction::None; 4]).is_err());
        assert!(dks(
            DksPoints::DEFAULT,
            [
                StageAction::None,
                StageAction::None,
                StageAction::None,
                StageAction::Hold
            ]
        )
        .is_err());
        assert!(dks(
            DksPoints {
                press: 36,
                ..DksPoints::DEFAULT
            },
            tap
        )
        .is_err());
        assert!(dks(
            DksPoints {
                bottom: 41,
                ..DksPoints::DEFAULT
            },
            tap
        )
        .is_err());
    }
}
