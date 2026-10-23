//! Main keyboard backlight (command `0x07`).
//!
//! Payload: `mode, brightness, speed, r, g, b, <6 effect bytes>`.
//! The meaning of the six effect bytes is not known yet; writes send zeros.

use serde::{Deserialize, Serialize};

use crate::frame::Frame;
use crate::{Error, Result};

pub const CMD: u8 = 0x07;
const WRITE_LEN: u8 = 0x0e;
pub(crate) const REPLY_LEN: usize = 6;
pub const MAX_BRIGHTNESS: u8 = 4;
pub const MAX_SPEED: u8 = 4;

/// Lighting effects, with the ids the firmware uses.
#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
pub enum LedMode {
    Static,
    Breath,
    Wave,
    Neon,
    Radar,
    Snake,
    Reactive,
    Aurora,
    Ripple,
    Twinkle,
    Custom,
    Cross,
    SpeedRespond,
    AutoRipple,
    Striation,
    Fireworks,
    MusicRhythm,
}

impl LedMode {
    pub const ALL: [LedMode; 17] = [
        Self::Static,
        Self::Breath,
        Self::Wave,
        Self::Neon,
        Self::Radar,
        Self::Snake,
        Self::Reactive,
        Self::Aurora,
        Self::Ripple,
        Self::Twinkle,
        Self::Custom,
        Self::Cross,
        Self::SpeedRespond,
        Self::AutoRipple,
        Self::Striation,
        Self::Fireworks,
        Self::MusicRhythm,
    ];

    pub fn id(self) -> u8 {
        match self {
            Self::Static => 0,
            Self::Breath => 1,
            Self::Wave => 2,
            Self::Neon => 3,
            Self::Radar => 4,
            Self::Snake => 5,
            Self::Reactive => 6,
            Self::Aurora => 7,
            Self::Ripple => 8,
            Self::Twinkle => 9,
            Self::Custom => 10,
            Self::Cross => 11,
            Self::SpeedRespond => 12,
            Self::AutoRipple => 14,
            Self::Striation => 15,
            Self::Fireworks => 16,
            Self::MusicRhythm => 100,
        }
    }

    pub fn from_id(id: u8) -> Option<Self> {
        Self::ALL.into_iter().find(|m| m.id() == id)
    }
}

/// Backlight state. `brightness` and `speed` run 0..=4.
#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
pub struct LedConfig {
    pub mode: LedMode,
    pub brightness: u8,
    pub speed: u8,
    pub color: [u8; 3],
}

pub(crate) fn read_frame() -> Frame {
    Frame::new(CMD, 1, 0, &[])
}

pub(crate) fn write_frame(cfg: &LedConfig) -> Result<Frame> {
    if cfg.brightness > MAX_BRIGHTNESS {
        return Err(Error::OutOfRange("brightness"));
    }
    if cfg.speed > MAX_SPEED {
        return Err(Error::OutOfRange("speed"));
    }
    let [r, g, b] = cfg.color;
    Ok(Frame::new(
        CMD,
        0,
        WRITE_LEN,
        &[cfg.mode.id(), cfg.brightness, cfg.speed, r, g, b],
    ))
}

pub(crate) fn parse(reply: &Frame) -> Result<LedConfig> {
    let p = reply.payload();
    Ok(LedConfig {
        mode: LedMode::from_id(p[0]).ok_or(Error::BadReply {
            cmd: CMD,
            reason: "unknown lighting mode",
        })?,
        brightness: p[1],
        speed: p[2],
        color: [p[3], p[4], p[5]],
    })
}

#[cfg(test)]
mod tests {
    use super::*;

    fn reply(payload: &[u8]) -> Frame {
        Frame::new(CMD, 0, payload.len() as u8, payload)
    }

    #[test]
    fn parses_captured_replies() {
        let radar = parse(&reply(&[
            0x04, 0x02, 0x00, 0xff, 0x74, 0xd9, 0, 0, 0, 7, 0, 0,
        ]))
        .unwrap();
        assert_eq!(
            radar,
            LedConfig {
                mode: LedMode::Radar,
                brightness: 2,
                speed: 0,
                color: [0xff, 0x74, 0xd9]
            }
        );
        let ripple = parse(&reply(&[
            0x0e, 0x04, 0x04, 0xff, 0x7d, 0x00, 0, 0, 0, 4, 0, 0,
        ]))
        .unwrap();
        assert_eq!(ripple.mode, LedMode::AutoRipple);
    }

    #[test]
    fn write_matches_captured_frame() {
        let cfg = LedConfig {
            mode: LedMode::Static,
            brightness: 4,
            speed: 2,
            color: [0xff, 0, 0],
        };
        let f = write_frame(&cfg).unwrap();
        assert_eq!(
            &f.0[..12],
            &[0x01, 0x07, 0x00, 0, 0, 0x0e, 0x00, 0x04, 0x02, 0xff, 0x00, 0x00]
        );
    }

    #[test]
    fn rejects_out_of_range() {
        let cfg = LedConfig {
            mode: LedMode::Static,
            brightness: 5,
            speed: 0,
            color: [0; 3],
        };
        assert!(write_frame(&cfg).is_err());
    }

    #[test]
    fn mode_ids_round_trip() {
        for m in LedMode::ALL {
            assert_eq!(LedMode::from_id(m.id()), Some(m));
        }
        assert_eq!(LedMode::from_id(13), None);
    }
}
