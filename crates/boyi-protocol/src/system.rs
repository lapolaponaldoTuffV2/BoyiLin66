//! System settings (command `0x14`): sleep timers.
//!
//! Byte 2 selects the operation. The data sits at fixed frame offsets past
//! a declared length of 1, and replies declare length 0, so frames are read
//! by offset instead of through [`Frame::payload`].

use serde::{Deserialize, Serialize};

use crate::frame::Frame;
use crate::{Error, Result};

pub const CMD: u8 = 0x14;
const OP_WRITE_SLEEP: u8 = 1;
const OP_READ_SLEEP: u8 = 2;
/// Frame offset of the sleep fields: light (u16 BE), keyboard (u16 BE), never.
const SLEEP_AT: usize = 9;

/// The official software's limits: the keyboard sleeps after 5–1000 minutes.
pub const MIN_KEYBOARD_SLEEP_S: u16 = 300;
pub const MAX_SLEEP_S: u16 = 60_000;

/// When the backlight and the keyboard go to sleep, in seconds.
#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
pub struct Sleep {
    pub light_s: u16,
    pub keyboard_s: u16,
    /// Never sleep.
    pub never: bool,
}

pub(crate) fn sleep_read_frame() -> Frame {
    Frame::new(CMD, OP_READ_SLEEP, 1, &[0])
}

pub(crate) fn parse_sleep(reply: &Frame) -> Sleep {
    let b = &reply.0[SLEEP_AT..];
    Sleep {
        light_s: u16::from_be_bytes([b[0], b[1]]),
        keyboard_s: u16::from_be_bytes([b[2], b[3]]),
        never: b[4] != 0,
    }
}

pub(crate) fn sleep_write_frame(s: &Sleep) -> Result<Frame> {
    if !(MIN_KEYBOARD_SLEEP_S..=MAX_SLEEP_S).contains(&s.keyboard_s) {
        return Err(Error::OutOfRange("keyboard sleep (300–60000 s)"));
    }
    if s.light_s > s.keyboard_s {
        return Err(Error::OutOfRange(
            "the light cannot sleep after the keyboard",
        ));
    }
    let mut f = Frame::new(CMD, OP_WRITE_SLEEP, 1, &[0]);
    let [lh, ll] = s.light_s.to_be_bytes();
    let [kh, kl] = s.keyboard_s.to_be_bytes();
    f.0[SLEEP_AT..SLEEP_AT + 5].copy_from_slice(&[lh, ll, kh, kl, s.never.into()]);
    Ok(f)
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn sleep_read_matches_hardware_test() {
        assert_eq!(
            &sleep_read_frame().0[..7],
            &[0x01, 0x14, 0x02, 0, 0, 0x01, 0]
        );
        let mut reply = Frame::new(CMD, OP_READ_SLEEP, 0, &[]);
        reply.0[9..13].copy_from_slice(&[0x00, 0x3c, 0x07, 0x08]);
        assert_eq!(
            parse_sleep(&reply),
            Sleep {
                light_s: 60,
                keyboard_s: 1800,
                never: false
            }
        );
    }

    #[test]
    fn sleep_write_layout_and_limits() {
        let s = Sleep {
            light_s: 600,
            keyboard_s: 3600,
            never: true,
        };
        let f = sleep_write_frame(&s).unwrap();
        assert_eq!(
            &f.0[..14],
            &[0x01, 0x14, 0x01, 0, 0, 0x01, 0, 0, 0, 0x02, 0x58, 0x0e, 0x10, 1]
        );
        let bad = |light_s, keyboard_s| {
            sleep_write_frame(&Sleep {
                light_s,
                keyboard_s,
                never: false,
            })
            .is_err()
        };
        assert!(bad(0, 299) && bad(0, 60_001) && bad(400, 300) && !bad(300, 300));
    }
}
