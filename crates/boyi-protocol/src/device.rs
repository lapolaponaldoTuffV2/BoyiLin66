//! Finding the keyboard and exchanging frames over `/dev/hidraw*`.

use std::fs::{self, File, OpenOptions};
use std::io::{ErrorKind, Read, Write};
use std::os::unix::fs::OpenOptionsExt;
use std::path::{Path, PathBuf};
use std::sync::Mutex;
use std::time::{Duration, Instant};

use crate::frame::{self, Frame};
use crate::keymap::{self, Keymap};
use crate::layout::KeyPos;
use crate::led::{self, KeyColors, LedConfig, SideLight};
use crate::magnetic::{self, KeyTrigger, Performance, TriggerSettings};
use crate::{Error, Result};

pub const VENDOR_ID: u16 = 0x0416;
pub const PRODUCT_ID: u16 = 0x7372;
/// First bytes of the config interface's report descriptor: Usage Page 0xFF1B.
const CONFIG_DESCRIPTOR_PREFIX: [u8; 3] = [0x06, 0x1b, 0xff];
const O_NONBLOCK: i32 = 0o4000;
const REPLY_TIMEOUT: Duration = Duration::from_millis(300);

/// Basic facts the keyboard reports about itself.
#[derive(Debug, Clone, serde::Serialize)]
pub struct DeviceInfo {
    pub path: PathBuf,
    pub serial: String,
    /// Raw handshake payload, kept until its fields are understood.
    pub handshake: Vec<u8>,
}

/// An open connection to the keyboard's configuration interface.
pub struct Keyboard {
    path: PathBuf,
    file: Mutex<File>,
}

impl Keyboard {
    /// Lists the hidraw nodes that are the config interface of a BOYI 66 Pro.
    pub fn find() -> Vec<PathBuf> {
        let Ok(entries) = fs::read_dir("/sys/class/hidraw") else {
            return vec![];
        };
        let mut found: Vec<PathBuf> = entries
            .flatten()
            .filter(|e| is_config_interface(&e.path()))
            .map(|e| Path::new("/dev").join(e.file_name()))
            .collect();
        found.sort();
        found
    }

    pub fn open_first() -> Result<Self> {
        Self::open(Self::find().into_iter().next().ok_or(Error::NotFound)?)
    }

    /// Opens a hidraw node and performs the handshake the firmware expects.
    pub fn open(path: impl Into<PathBuf>) -> Result<Self> {
        let path = path.into();
        let file = OpenOptions::new()
            .read(true)
            .write(true)
            .custom_flags(O_NONBLOCK)
            .open(&path)?;
        let kb = Self {
            path,
            file: Mutex::new(file),
        };
        kb.handshake()?;
        Ok(kb)
    }

    pub fn path(&self) -> &Path {
        &self.path
    }

    /// Sends a frame and returns the first reply to the same command.
    pub fn request(&self, frame: &Frame, min_payload: usize) -> Result<Frame> {
        let mut file = self.file.lock().unwrap_or_else(|e| e.into_inner());
        drain(&mut file)?;
        file.write_all(&frame.0)?;
        read_reply(&mut file, frame.cmd(), min_payload, REPLY_TIMEOUT)
    }

    /// Sends a frame the firmware does not answer.
    pub fn send(&self, frame: &Frame) -> Result<()> {
        let mut file = self.file.lock().unwrap_or_else(|e| e.into_inner());
        file.write_all(&frame.0)?;
        Ok(())
    }

    fn handshake(&self) -> Result<Vec<u8>> {
        Ok(self
            .request(&Frame::new(0x01, 0, 1, &[1]), 1)?
            .payload()
            .to_vec())
    }

    pub fn info(&self) -> Result<DeviceInfo> {
        let handshake = self.handshake()?;
        let sn = self.request(&Frame::new(0x15, 0, 0, &[]), 1)?;
        Ok(DeviceInfo {
            path: self.path.clone(),
            serial: String::from_utf8_lossy(sn.payload())
                .trim_end_matches('\0')
                .to_owned(),
            handshake,
        })
    }

    pub fn led(&self) -> Result<LedConfig> {
        led::parse(&self.request(&led::read_frame(), led::REPLY_LEN)?)
    }

    /// Writes the lighting config. The firmware sends no reply, so this reads
    /// the config back and fails if it did not take.
    pub fn set_led(&self, cfg: &LedConfig) -> Result<LedConfig> {
        self.send(&led::write_frame(cfg)?)?;
        std::thread::sleep(Duration::from_millis(50));
        let now = self.led()?;
        if now.mode != cfg.mode || now.color != cfg.color {
            return Err(Error::BadReply {
                cmd: led::CMD,
                reason: "keyboard kept the old lighting",
            });
        }
        Ok(now)
    }

    pub fn side_light(&self) -> Result<SideLight> {
        led::parse_side(&self.request(&led::side_read_frame(), led::SIDE_REPLY_LEN)?)
    }

    /// Writes the side light, then reads it back and fails if it did not
    /// take. Not confirmed on hardware yet.
    pub fn set_side_light(&self, side: &SideLight) -> Result<SideLight> {
        self.send(&led::side_write_frame(side)?)?;
        std::thread::sleep(Duration::from_millis(50));
        let now = self.side_light()?;
        if now.mode != side.mode || now.color != side.color {
            return Err(Error::BadReply {
                cmd: led::SIDE_CMD,
                reason: "keyboard kept the old side light",
            });
        }
        Ok(now)
    }

    /// Writes the Custom effect's colours; select the Custom effect with
    /// [`Self::set_led`] to show them. The firmware does not answer.
    pub fn set_key_colors(&self, colors: &KeyColors) -> Result<()> {
        for frame in colors.frames() {
            self.send(&frame)?;
            // Without replies there is no flow control; give each packet time to land.
            std::thread::sleep(Duration::from_millis(10));
        }
        Ok(())
    }

    pub fn performance(&self) -> Result<Performance> {
        let len = magnetic::PERFORMANCE_REPLY_LEN;
        Ok(Performance {
            debounce: magnetic::parse_debounce(
                &self.request(&magnetic::debounce_read_frame(), len)?,
            )?,
            report_rate_khz: magnetic::parse_report_rate(
                &self.request(&magnetic::report_rate_read_frame(), len)?,
            )?,
        })
    }

    /// Writes debounce and report rate, then reads them back and fails if
    /// they did not take. The writes are not confirmed on hardware yet.
    pub fn set_performance(&self, p: &Performance) -> Result<Performance> {
        for frame in magnetic::performance_frames(p)? {
            self.send(&frame)?;
            std::thread::sleep(Duration::from_millis(50));
        }
        let now = self.performance()?;
        if now != *p {
            return Err(Error::BadReply {
                cmd: magnetic::CMD,
                reason: "keyboard kept the old debounce or report rate",
            });
        }
        Ok(now)
    }

    /// Resets every key's travel settings to the factory values. Not
    /// confirmed on hardware; read the keys back afterwards.
    pub fn reset_sensitivity(&self) -> Result<()> {
        self.send(&magnetic::reset_frame())?;
        std::thread::sleep(Duration::from_millis(200));
        Ok(())
    }

    /// Calibrates one key: the user presses it to the bottom and releases it
    /// within `timeout`. Returns whether the keyboard reported success. The
    /// key always leaves calibration mode afterwards.
    pub fn calibrate_key(&self, key: KeyPos, timeout: Duration) -> Result<bool> {
        check_write_ack(&self.request(&magnetic::calibration_keys_frame(&[key])?, 1)?)?;
        let result = self.wait_calibration(key, timeout);
        let leave = self.request(&magnetic::calibration_keys_frame(&[])?, 1);
        let done = result?;
        check_write_ack(&leave?)?;
        Ok(done)
    }

    fn wait_calibration(&self, key: KeyPos, timeout: Duration) -> Result<bool> {
        let mut reply = self.request(&magnetic::calibrate_frame(key), 2)?;
        let deadline = Instant::now() + timeout;
        let mut file = self.file.lock().unwrap_or_else(|e| e.into_inner());
        loop {
            if let Some(done) = magnetic::calibration_status(&reply) {
                return Ok(done);
            }
            let left = deadline.saturating_duration_since(Instant::now());
            if left.is_zero() {
                return Err(Error::Timeout(magnetic::CMD));
            }
            reply = read_reply(&mut file, magnetic::CMD, 2, left)?;
        }
    }

    pub fn key_trigger(&self, key: KeyPos) -> Result<KeyTrigger> {
        magnetic::parse_key(
            &self.request(&magnetic::query_key_frame(key), magnetic::KEY_REPLY_LEN)?,
        )
    }

    /// Applies one trigger setting to several keys at once.
    pub fn set_trigger(&self, keys: &[KeyPos], settings: &TriggerSettings) -> Result<()> {
        let reply = self.request(&magnetic::apply_frame(keys, settings)?, 1)?;
        match reply.payload()[0] {
            0 => Ok(()),
            _ => Err(Error::BadReply {
                cmd: magnetic::CMD,
                reason: "keyboard rejected the trigger setting",
            }),
        }
    }

    /// Replaces the base layer and every macro and advanced-key slot. Each
    /// packet is acknowledged with status `0`.
    ///
    /// Packets go out one at a time, each waiting for its acknowledgement, so
    /// a reply always belongs to the last packet sent. A failure part-way
    /// leaves the earlier packets applied; the keyboard cannot roll back.
    pub fn write_keymap(&self, map: &Keymap) -> Result<()> {
        for frame in keymap::write_frames(map)? {
            check_write_ack(&self.request(&frame, 0)?)?;
        }
        Ok(())
    }
}

/// Keymap and advanced-key writes are acknowledged with an echo of the
/// command, a declared payload length of 0 and status `0` in byte 6. The
/// packet index is not echoed.
fn check_write_ack(reply: &Frame) -> Result<()> {
    match reply.0[6] {
        0 => Ok(()),
        _ => Err(Error::BadReply {
            cmd: reply.cmd(),
            reason: "keyboard rejected a keymap packet",
        }),
    }
}

fn is_config_interface(sys: &Path) -> bool {
    let uevent = fs::read_to_string(sys.join("device/uevent")).unwrap_or_default();
    let id = format!("HID_ID=0003:{VENDOR_ID:08X}:{PRODUCT_ID:08X}");
    uevent.lines().any(|l| l == id)
        && fs::read(sys.join("device/report_descriptor"))
            .is_ok_and(|d| d.starts_with(&CONFIG_DESCRIPTOR_PREFIX))
}

/// Discards reports left over from earlier commands so replies line up.
/// Waits up to `timeout` for a frame answering `cmd`.
fn read_reply(file: &mut File, cmd: u8, min_payload: usize, timeout: Duration) -> Result<Frame> {
    let deadline = Instant::now() + timeout;
    let mut buf = [0u8; frame::LEN];
    while Instant::now() < deadline {
        match file.read(&mut buf) {
            Ok(n) if n == frame::LEN && buf[1] == cmd => {
                return Frame::parse_reply(&buf, cmd, min_payload);
            }
            Ok(_) => {}
            Err(e) if e.kind() == ErrorKind::WouldBlock => {
                std::thread::sleep(Duration::from_millis(5))
            }
            Err(e) => return Err(e.into()),
        }
    }
    Err(Error::Timeout(cmd))
}

fn drain(file: &mut File) -> Result<()> {
    let mut buf = [0u8; frame::LEN];
    loop {
        match file.read(&mut buf) {
            Ok(_) => {}
            Err(e) if e.kind() == ErrorKind::WouldBlock => return Ok(()),
            Err(e) => return Err(e.into()),
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    fn raw(head: &[u8]) -> [u8; frame::LEN] {
        let mut b = [0u8; frame::LEN];
        b[..head.len()].copy_from_slice(head);
        b
    }

    #[test]
    fn accepts_the_captured_acknowledgements() {
        for cmd in [keymap::CMD, crate::advanced::CMD] {
            let reply = Frame::parse_reply(&raw(&[0x01, cmd, 0, 0, 0, 0]), cmd, 0).unwrap();
            assert!(check_write_ack(&reply).is_ok());
        }
    }

    #[test]
    fn rejects_bad_acknowledgements() {
        let nonzero_status =
            Frame::parse_reply(&raw(&[0x01, 0x18, 0, 0, 0, 0, 0x01]), 0x18, 0).unwrap();
        assert!(check_write_ack(&nonzero_status).is_err());
        // A reply to another command never reaches the status check.
        assert!(Frame::parse_reply(&raw(&[0x01, 0x07, 0, 0, 0, 0]), 0x18, 0).is_err());
    }
}
