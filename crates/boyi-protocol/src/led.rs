//! Main keyboard backlight (command `0x07`), side light (command `0x08`) and
//! the per-key colours of the Custom effect (command `0x09`).
//!
//! Payload: `mode, brightness, speed, r, g, b, <6 effect bytes>`.
//! The meaning of the six effect bytes is not known yet; writes send zeros.

use serde::{Deserialize, Serialize};

use crate::frame::Frame;
use crate::layout::{KeyPos, SLOTS};
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

/// Side light effects, with the ids the firmware uses.
#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
pub enum SideMode {
    Static,
    Breath,
    Wave,
    Collision,
    Neon,
    Off,
}

impl SideMode {
    pub const ALL: [SideMode; 6] = [
        Self::Static,
        Self::Breath,
        Self::Wave,
        Self::Collision,
        Self::Neon,
        Self::Off,
    ];

    fn id(self) -> u8 {
        self as u8
    }

    fn from_id(id: u8) -> Option<Self> {
        Self::ALL.get(id as usize).copied()
    }
}

/// Side light state, laid out like the backlight. The read is confirmed on
/// hardware; writing is not yet.
#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
pub struct SideLight {
    pub mode: SideMode,
    /// 0–4.
    pub brightness: u8,
    /// 0–4.
    pub speed: u8,
    pub color: [u8; 3],
    /// Six effect bytes of unknown meaning, written back as read.
    pub options: [u8; 6],
}

pub const SIDE_CMD: u8 = 0x08;
const SIDE_WRITE_LEN: u8 = 0x0d;
pub(crate) const SIDE_REPLY_LEN: usize = 12;

pub(crate) fn side_read_frame() -> Frame {
    Frame::new(SIDE_CMD, 1, 0, &[])
}

pub(crate) fn side_write_frame(side: &SideLight) -> Result<Frame> {
    if side.brightness > MAX_BRIGHTNESS {
        return Err(Error::OutOfRange("side light brightness"));
    }
    if side.speed > MAX_SPEED {
        return Err(Error::OutOfRange("side light speed"));
    }
    let mut options = side.options;
    // The official software clears this byte for the static effect.
    if side.mode == SideMode::Static {
        options[4] = 0;
    }
    let [r, g, b] = side.color;
    let mut payload = vec![side.mode.id(), side.brightness, side.speed, r, g, b];
    payload.extend(options);
    Ok(Frame::new(SIDE_CMD, 0, SIDE_WRITE_LEN, &payload))
}

pub(crate) fn parse_side(reply: &Frame) -> Result<SideLight> {
    let p = reply.payload();
    Ok(SideLight {
        mode: SideMode::from_id(p[0]).ok_or(Error::BadReply {
            cmd: SIDE_CMD,
            reason: "unknown side light mode",
        })?,
        brightness: p[1],
        speed: p[2],
        color: [p[3], p[4], p[5]],
        options: p[6..12].try_into().expect("reply length checked"),
    })
}

/// Colours for the Custom effect: one RGB per matrix slot, row-major.
///
/// The keyboard cannot report them back, so callers keep their own copy.
#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
#[serde(try_from = "Vec<[u8; 3]>", into = "Vec<[u8; 3]>")]
pub struct KeyColors(Vec<[u8; 3]>);

impl KeyColors {
    pub const CMD: u8 = 0x09;
    const PER_PACKET: usize = 18;

    /// Every key the same colour.
    pub fn uniform(color: [u8; 3]) -> Self {
        Self(vec![color; SLOTS])
    }

    pub fn set(&mut self, pos: KeyPos, color: [u8; 3]) -> Result<()> {
        if !pos.in_matrix() {
            return Err(Error::OutOfRange("key position"));
        }
        self.0[pos.index()] = color;
        Ok(())
    }

    /// Eight packets of 18 slots (the last has 6) for custom slot 0. The
    /// keyboard does not answer them.
    pub(crate) fn frames(&self) -> Vec<Frame> {
        self.0
            .chunks(Self::PER_PACKET)
            .enumerate()
            .map(|(index, chunk)| {
                let payload: Vec<u8> = chunk.iter().flatten().copied().collect();
                Frame::new(Self::CMD, 0, payload.len() as u8, &payload).with_index(index as u8)
            })
            .collect()
    }
}

/// White, until the app has written colours of its own.
impl Default for KeyColors {
    fn default() -> Self {
        Self::uniform([0xff; 3])
    }
}

impl TryFrom<Vec<[u8; 3]>> for KeyColors {
    type Error = String;

    fn try_from(slots: Vec<[u8; 3]>) -> std::result::Result<Self, String> {
        if slots.len() != SLOTS {
            return Err(format!(
                "key colours need {SLOTS} slots, got {}",
                slots.len()
            ));
        }
        Ok(Self(slots))
    }
}

impl From<KeyColors> for Vec<[u8; 3]> {
    fn from(colors: KeyColors) -> Self {
        colors.0
    }
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
    fn key_colors_match_hardware_test() {
        // The slot-finding test lit Esc (1,0) red and PgUp (2,17) green.
        let mut colors = KeyColors::uniform([0; 3]);
        colors.set(KeyPos { row: 1, col: 0 }, [0xff, 0, 0]).unwrap();
        colors
            .set(KeyPos { row: 2, col: 17 }, [0, 0xff, 0])
            .unwrap();
        let frames = colors.frames();
        assert_eq!(frames.len(), 8);
        assert!(frames[..7].iter().all(|f| f.0[5] == 54));
        // Esc is slot 22: packet 1, entry 4.
        assert_eq!(&frames[1].0[..6], &[0x01, 0x09, 0, 0, 1, 54]);
        assert_eq!(&frames[1].0[18..21], &[0xff, 0, 0]);
        // PgUp is slot 61: packet 3, entry 7.
        assert_eq!(&frames[3].0[27..30], &[0, 0xff, 0]);
        assert_eq!(&frames[7].0[..6], &[0x01, 0x09, 0, 0, 7, 18]);
        assert!(colors.set(KeyPos { row: 6, col: 0 }, [0; 3]).is_err());
    }

    #[test]
    fn key_colors_json_needs_every_slot() {
        let json = serde_json::to_string(&KeyColors::default()).unwrap();
        assert!(json.starts_with("[[255,255,255],"));
        assert!(serde_json::from_str::<KeyColors>(&json).is_ok());
        assert!(serde_json::from_str::<KeyColors>("[[1,2,3]]").is_err());
    }

    #[test]
    fn side_light_round_trips_the_captured_reply() {
        let captured = [0x02, 0x04, 0x03, 0xff, 0, 0, 0, 0, 0, 0, 0x01, 0];
        let side = parse_side(&Frame::new(SIDE_CMD, 0, 12, &captured)).unwrap();
        assert_eq!(side.mode, SideMode::Wave);
        assert_eq!(
            (side.brightness, side.speed, side.color),
            (4, 3, [0xff, 0, 0])
        );
        let f = side_write_frame(&side).unwrap();
        assert_eq!(&f.0[..6], &[0x01, 0x08, 0, 0, 0, 0x0d]);
        assert_eq!(&f.0[6..18], &captured);
        // Static clears option byte 4, as the official software does.
        let f = side_write_frame(&SideLight {
            mode: SideMode::Static,
            ..side.clone()
        })
        .unwrap();
        assert_eq!(f.0[6 + 10], 0);
        assert!(side_write_frame(&SideLight { speed: 5, ..side }).is_err());
        assert_eq!(SideMode::from_id(5), Some(SideMode::Off));
        assert_eq!(SideMode::from_id(6), None);
    }

    #[test]
    fn mode_ids_round_trip() {
        for m in LedMode::ALL {
            assert_eq!(LedMode::from_id(m.id()), Some(m));
        }
        assert_eq!(LedMode::from_id(13), None);
    }
}
