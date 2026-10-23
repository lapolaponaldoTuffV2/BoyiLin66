//! System settings (command `0x14`): sleep timers and what Win lock blocks.
//!
//! Byte 2 selects the operation. The data sits at fixed frame offsets past
//! a declared length of 1, and replies declare length 0, so frames are read
//! by offset instead of through [`Frame::payload`].

use serde::{Deserialize, Serialize};

use crate::frame::Frame;
use crate::{Error, Result};

pub const CMD: u8 = 0x14;
const OP_WIN_LOCK: u8 = 0;
const OP_WRITE_SLEEP: u8 = 1;
const OP_READ_SLEEP: u8 = 2;
/// Frame offset of the sleep fields: light (u16 BE), keyboard (u16 BE), never.
const SLEEP_AT: usize = 9;
/// Frame offset of the Win-lock flags.
const WIN_LOCK_AT: usize = 13;

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

/// What stays blocked while Win lock is on. The keyboard cannot report it.
#[derive(Debug, Clone, Copy, Default, PartialEq, Eq, Serialize, Deserialize)]
pub struct WinLock {
    pub windows: bool,
    pub shift_tab: bool,
    pub alt_tab: bool,
    pub alt_f4: bool,
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

/// Byte 6 stays `0`: with operation 0, a `1` there is the factory reset.
pub(crate) fn win_lock_frame(w: &WinLock) -> Frame {
    let mut f = Frame::new(CMD, OP_WIN_LOCK, 1, &[0]);
    f.0[WIN_LOCK_AT..WIN_LOCK_AT + 4].copy_from_slice(&[
        w.shift_tab.into(),
        w.alt_tab.into(),
        w.windows.into(),
        w.alt_f4.into(),
    ]);
    f
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

    #[test]
    fn win_lock_never_sends_the_factory_reset() {
        let f = win_lock_frame(&WinLock {
            windows: true,
            shift_tab: false,
            alt_tab: true,
            alt_f4: true,
        });
        assert_eq!(&f.0[..7], &[0x01, 0x14, 0x00, 0, 0, 0x01, 0x00]);
        assert!(f.0[7..13].iter().all(|&b| b == 0));
        assert_eq!(&f.0[13..17], &[0, 1, 1, 1]);
        assert!(f.0[17..].iter().all(|&b| b == 0));
    }
}
