//! Macros (command `0x19`): key presses and releases the keyboard plays back.
//!
//! The firmware keeps 10 macros of 256 bytes. A key plays one through its
//! keymap entry, so macros are written together with the keymap (see
//! [`crate::keymap`]).

use serde::{Deserialize, Serialize};

use crate::frame::Frame;
use crate::{Error, Result};

pub const CMD: u8 = 0x19;
pub const SLOTS: usize = 10;
/// Steps that fit after the 8-byte header.
pub const MAX_STEPS: usize = 62;
/// Every macro is sent as 5 packets: 4 × 58 bytes, then 24.
pub const PACKETS: usize = 5;

const SIZE: usize = 256;
const HEADER: usize = 8;
const STEP: usize = 4;
const PACKET: usize = 58;
const DOWN: u8 = 0x10;

/// How a macro plays when its key is pressed.
#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
#[serde(tag = "type", rename_all = "snake_case")]
pub enum Playback {
    /// Once per press, also when the key is held.
    Once,
    /// `count` times per press.
    Repeat { count: u8 },
    /// A press starts repeating it, the next press stops it.
    Toggle,
    /// Repeats while the key is held.
    WhileHeld,
}

/// A key press or release, then a pause.
#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
pub struct MacroStep {
    /// HID keyboard usage, modifiers (`0xE0`–`0xE7`) included.
    pub usage: u8,
    /// `true` presses the key, `false` releases it.
    pub down: bool,
    /// Pause after this step in ms; after the last step it separates repeats.
    pub delay_ms: u16,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
pub struct Macro {
    pub playback: Playback,
    pub steps: Vec<MacroStep>,
}

impl Macro {
    fn bytes(&self) -> Result<[u8; SIZE]> {
        if self.steps.is_empty() || self.steps.len() > MAX_STEPS {
            return Err(Error::OutOfRange("a macro needs 1–62 steps"));
        }
        // Every pressed key must be released, or it would stay held on the computer.
        let mut held = Vec::new();
        for step in &self.steps {
            if step.usage == 0 {
                return Err(Error::OutOfRange("macro key usage"));
            }
            match (step.down, held.iter().position(|&u| u == step.usage)) {
                (true, None) => held.push(step.usage),
                (false, Some(i)) => {
                    held.swap_remove(i);
                }
                _ => {
                    return Err(Error::OutOfRange(
                        "macro steps must press, then release, each key",
                    ))
                }
            }
        }
        if !held.is_empty() {
            return Err(Error::OutOfRange("macro leaves a key pressed"));
        }
        let (mode, count) = match self.playback {
            Playback::Once => (0, 1),
            Playback::Repeat { count: 0 } => {
                return Err(Error::OutOfRange("macro repeat count (1–255)"))
            }
            Playback::Repeat { count } => (1, count),
            Playback::Toggle => (2, 1),
            Playback::WhileHeld => (3, 1),
        };
        let mut b = [0; SIZE];
        b[1] = mode;
        b[3] = (self.steps.len() * STEP) as u8;
        b[5] = count;
        for (i, step) in self.steps.iter().enumerate() {
            let [hi, lo] = step.delay_ms.to_be_bytes();
            let flags = if step.down { DOWN } else { 0 };
            b[HEADER + i * STEP..][..STEP].copy_from_slice(&[step.usage, flags, hi, lo]);
        }
        Ok(b)
    }
}

/// The packets that write `m` into `slot`, or empty the slot.
pub(crate) fn slot_frames(slot: u8, m: Option<&Macro>) -> Result<Vec<Frame>> {
    let bytes = match m {
        Some(m) => m.bytes()?,
        None => [0; SIZE],
    };
    Ok(bytes
        .chunks(PACKET)
        .enumerate()
        .map(|(i, chunk)| Frame::new(CMD, slot, chunk.len() as u8, chunk).with_index(i as u8))
        .collect())
}

#[cfg(test)]
mod tests {
    use super::*;

    const F13: u8 = 0x68;
    const F14: u8 = 0x69;

    fn step(usage: u8, down: bool, delay_ms: u16) -> MacroStep {
        MacroStep {
            usage,
            down,
            delay_ms,
        }
    }

    #[test]
    fn matches_hardware_test() {
        let m = Macro {
            playback: Playback::Once,
            steps: vec![
                step(F13, true, 300),
                step(F13, false, 100),
                step(F14, true, 100),
                step(F14, false, 0),
            ],
        };
        let frames = slot_frames(0, Some(&m)).unwrap();
        assert_eq!(frames.len(), PACKETS);
        assert_eq!(
            &frames[0].0[..30],
            &[
                0x01, 0x19, 0x00, 0x00, 0x00, 0x3a, // header
                0x00, 0x00, 0x00, 0x10, 0x00, 0x01, 0x00, 0x00, // mode, 16 bytes, count
                0x68, 0x10, 0x01, 0x2c, 0x68, 0x00, 0x00, 0x64, //
                0x69, 0x10, 0x00, 0x64, 0x69, 0x00, 0x00, 0x00,
            ]
        );
        assert!(frames[0].0[30..].iter().all(|&b| b == 0));
        assert_eq!(&frames[4].0[..6], &[0x01, 0x19, 0x00, 0x00, 0x04, 0x18]);
    }

    #[test]
    fn playback_modes_match_hardware_test() {
        let header = |playback| {
            let m = Macro {
                playback,
                steps: vec![step(F14, true, 100), step(F14, false, 200)],
            };
            slot_frames(1, Some(&m)).unwrap()[0].0[..16].to_vec()
        };
        assert_eq!(
            header(Playback::Repeat { count: 3 }),
            [1, 0x19, 1, 0, 0, 0x3a, 0, 1, 0, 8, 0, 3, 0, 0, 0x69, 0x10]
        );
        assert_eq!(header(Playback::Once)[7], 0);
        assert_eq!(header(Playback::Toggle)[7], 2);
        assert_eq!(header(Playback::WhileHeld)[7], 3);
    }

    #[test]
    fn steps_split_across_packets() {
        let steps = (0..31)
            .flat_map(|i| [step(4 + i, true, 1), step(4 + i, false, 2)])
            .collect();
        let m = Macro {
            playback: Playback::Once,
            steps,
        };
        let frames = slot_frames(9, Some(&m)).unwrap();
        let lens: Vec<u8> = frames.iter().map(|f| f.0[5]).collect();
        assert_eq!(lens, [0x3a, 0x3a, 0x3a, 0x3a, 0x18]);
        // Step 13 (byte 8 + 52) starts in packet 1 at payload offset 2.
        assert_eq!(&frames[1].0[8..12], &[4 + 6, 0x00, 0, 2]);
        // The 62nd step fills the last four bytes.
        assert_eq!(&frames[4].0[26..30], &[4 + 30, 0x00, 0, 2]);
    }

    #[test]
    fn empty_slot_is_all_zero() {
        let frames = slot_frames(3, None).unwrap();
        assert_eq!(&frames[2].0[..6], &[0x01, 0x19, 3, 0, 2, 0x3a]);
        assert!(frames.iter().all(|f| f.0[6..].iter().all(|&b| b == 0)));
    }

    #[test]
    fn rejects_bad_macros() {
        let bad = |playback, steps: Vec<MacroStep>| Macro { playback, steps }.bytes().is_err();
        let tap = vec![step(F13, true, 0), step(F13, false, 0)];
        assert!(!bad(Playback::Once, tap.clone()));
        assert!(bad(Playback::Repeat { count: 0 }, tap));
        assert!(bad(Playback::Once, vec![]));
        assert!(bad(Playback::Once, vec![step(F13, true, 0)]));
        assert!(bad(Playback::Once, vec![step(F13, false, 0)]));
        assert!(bad(
            Playback::Once,
            vec![step(F13, true, 0), step(F13, true, 0)]
        ));
        assert!(bad(
            Playback::Once,
            vec![step(0, true, 0), step(0, false, 0)]
        ));
        let long = (0..32)
            .flat_map(|_| [step(F13, true, 0), step(F13, false, 0)])
            .collect();
        assert!(bad(Playback::Once, long));
    }
}
