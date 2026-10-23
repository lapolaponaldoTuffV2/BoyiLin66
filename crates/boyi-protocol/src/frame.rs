//! The 64-byte report every command and reply uses.
//!
//! ```text
//! byte 0     report id (always 0x01)
//! byte 1     command
//! byte 2     direction flag for commands that both read and write (1 = read)
//! byte 3     zero
//! byte 4     packet index in multi-packet transfers, otherwise zero
//! byte 5     payload length
//! byte 6..   payload
//! ```

use crate::{Error, Result};

pub const REPORT_ID: u8 = 0x01;
pub const LEN: usize = 64;
const HEADER: usize = 6;
pub const MAX_PAYLOAD: usize = LEN - HEADER;

/// One HID report, either sent to or received from the keyboard.
#[derive(Clone, PartialEq, Eq)]
pub struct Frame(pub [u8; LEN]);

impl Frame {
    /// Builds a frame. `len` is what goes in the length byte; some commands
    /// declare a fixed length that differs from the bytes actually used.
    pub fn new(cmd: u8, flag: u8, len: u8, payload: &[u8]) -> Self {
        assert!(payload.len() <= MAX_PAYLOAD, "payload too large");
        let mut b = [0; LEN];
        b[0] = REPORT_ID;
        b[1] = cmd;
        b[2] = flag;
        b[5] = len;
        b[HEADER..HEADER + payload.len()].copy_from_slice(payload);
        Self(b)
    }

    /// Sets the packet index of a multi-packet transfer.
    pub fn with_index(mut self, index: u8) -> Self {
        self.0[4] = index;
        self
    }

    pub fn cmd(&self) -> u8 {
        self.0[1]
    }

    /// Payload bytes as declared by the length byte.
    pub fn payload(&self) -> &[u8] {
        let len = (self.0[5] as usize).min(MAX_PAYLOAD);
        &self.0[HEADER..HEADER + len]
    }

    /// Parses a reply, checking it answers `cmd` and carries at least `min` payload bytes.
    pub fn parse_reply(raw: &[u8], cmd: u8, min: usize) -> Result<Self> {
        let raw: [u8; LEN] = raw.try_into().map_err(|_| Error::BadReply {
            cmd,
            reason: "wrong report size",
        })?;
        let frame = Self(raw);
        if frame.0[0] != REPORT_ID || frame.cmd() != cmd {
            return Err(Error::BadReply {
                cmd,
                reason: "reply is for another command",
            });
        }
        if frame.payload().len() < min {
            return Err(Error::BadReply {
                cmd,
                reason: "payload too short",
            });
        }
        Ok(frame)
    }
}

impl std::fmt::Debug for Frame {
    fn fmt(&self, f: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
        for b in &self.0[..HEADER + self.payload().len()] {
            write!(f, "{b:02x} ")?;
        }
        Ok(())
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn header_layout() {
        let f = Frame::new(0x07, 1, 0, &[]);
        assert_eq!(&f.0[..6], &[0x01, 0x07, 0x01, 0, 0, 0]);
    }

    #[test]
    fn reply_validation() {
        let mut raw = [0u8; 64];
        raw[..8].copy_from_slice(&[1, 0x15, 0, 0, 0, 2, 0xaa, 0xbb]);
        assert_eq!(
            Frame::parse_reply(&raw, 0x15, 2).unwrap().payload(),
            &[0xaa, 0xbb]
        );
        assert!(Frame::parse_reply(&raw, 0x07, 0).is_err());
        assert!(Frame::parse_reply(&raw, 0x15, 3).is_err());
        assert!(Frame::parse_reply(&raw[..10], 0x15, 0).is_err());
    }
}
