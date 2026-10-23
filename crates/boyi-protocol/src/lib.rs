//! Configuration protocol for the BOYI 66 Pro magnetic (Hall effect) keyboard.
//!
//! The keyboard exposes a vendor HID interface (usage page `0xFF1B`) that
//! accepts 64-byte reports. This crate builds and parses those reports and
//! talks to the device through Linux `hidraw`, with no other system
//! dependencies.
//!
//! ```no_run
//! use boyi_protocol::{Keyboard, led::{LedConfig, LedMode}};
//!
//! let kb = Keyboard::open_first()?;
//! kb.set_led(&LedConfig { mode: LedMode::Static, brightness: 4, speed: 2, color: [255, 0, 0] })?;
//! # Ok::<(), boyi_protocol::Error>(())
//! ```
//!
//! See `docs/protocol.md` in the repository for the wire format.

pub mod advanced;
pub mod device;
pub mod frame;
pub mod keymap;
pub mod layout;
pub mod led;
pub mod magnetic;

pub use device::Keyboard;
pub use frame::Frame;

/// Errors returned by this crate.
#[derive(Debug, thiserror::Error)]
pub enum Error {
    #[error("no BOYI 66 Pro keyboard found (is the udev rule installed?)")]
    NotFound,
    #[error("device I/O failed: {0}")]
    Io(#[from] std::io::Error),
    #[error("keyboard did not answer command {0:#04x}")]
    Timeout(u8),
    #[error("malformed reply to command {cmd:#04x}: {reason}")]
    BadReply { cmd: u8, reason: &'static str },
    #[error("value out of range: {0}")]
    OutOfRange(&'static str),
}

pub type Result<T> = std::result::Result<T, Error>;
