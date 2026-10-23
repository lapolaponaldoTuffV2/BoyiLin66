//! Where each physical key sits in the firmware's 6 × 22 key matrix.
//!
//! Positions and labels were confirmed on hardware by lighting single matrix
//! slots. Lists that cover every key (keymap, per-key colour) walk all 132
//! slots in row-major order, empty slots included.

use serde::{Deserialize, Serialize};

pub const ROWS: u8 = 6;
pub const COLS: u8 = 22;
pub const SLOTS: usize = ROWS as usize * COLS as usize;

/// A slot in the key matrix.
#[derive(Debug, Clone, Copy, PartialEq, Eq, Hash, Serialize, Deserialize)]
pub struct KeyPos {
    pub row: u8,
    pub col: u8,
}

impl KeyPos {
    /// Position in row-major slot lists.
    pub fn index(self) -> usize {
        self.row as usize * COLS as usize + self.col as usize
    }
}

/// A physical key: matrix slot, factory function, and where to draw it in
/// key units (1u = one alpha key).
#[derive(Debug, Clone, Serialize)]
pub struct Key {
    pub pos: KeyPos,
    pub label: &'static str,
    /// HID keyboard usage the key sends by default; `None` for Fn.
    pub usage: Option<u8>,
    pub x: f32,
    pub y: f32,
    pub w: f32,
}

const fn k(row: u8, col: u8, label: &'static str, usage: u8, x: f32, w: f32) -> Key {
    Key {
        pos: KeyPos { row, col },
        label,
        usage: if usage == 0 { None } else { Some(usage) },
        x,
        y: (row - 1) as f32,
        w,
    }
}

/// The 66 keys of the BOYI 66 Pro.
pub static KEYS: [Key; 66] = [
    // Number row
    k(1, 0, "Esc", 0x29, 0.0, 1.0),
    k(1, 1, "1", 0x1e, 1.0, 1.0),
    k(1, 2, "2", 0x1f, 2.0, 1.0),
    k(1, 3, "3", 0x20, 3.0, 1.0),
    k(1, 4, "4", 0x21, 4.0, 1.0),
    k(1, 5, "5", 0x22, 5.0, 1.0),
    k(1, 6, "6", 0x23, 6.0, 1.0),
    k(1, 7, "7", 0x24, 7.0, 1.0),
    k(1, 8, "8", 0x25, 8.0, 1.0),
    k(1, 9, "9", 0x26, 9.0, 1.0),
    k(1, 10, "0", 0x27, 10.0, 1.0),
    k(1, 11, "-", 0x2d, 11.0, 1.0),
    k(1, 12, "=", 0x2e, 12.0, 1.0),
    k(1, 14, "Backspace", 0x2a, 13.0, 2.0),
    // Top row
    k(2, 0, "Tab", 0x2b, 0.0, 1.5),
    k(2, 1, "Q", 0x14, 1.5, 1.0),
    k(2, 2, "W", 0x1a, 2.5, 1.0),
    k(2, 3, "E", 0x08, 3.5, 1.0),
    k(2, 4, "R", 0x15, 4.5, 1.0),
    k(2, 5, "T", 0x17, 5.5, 1.0),
    k(2, 6, "Y", 0x1c, 6.5, 1.0),
    k(2, 7, "U", 0x18, 7.5, 1.0),
    k(2, 8, "I", 0x0c, 8.5, 1.0),
    k(2, 9, "O", 0x12, 9.5, 1.0),
    k(2, 10, "P", 0x13, 10.5, 1.0),
    k(2, 11, "[", 0x2f, 11.5, 1.0),
    k(2, 12, "]", 0x30, 12.5, 1.0),
    k(2, 14, "\\", 0x31, 13.5, 1.5),
    k(2, 17, "PgUp", 0x4b, 15.0, 1.0),
    // Home row
    k(3, 0, "Caps", 0x39, 0.0, 1.75),
    k(3, 2, "A", 0x04, 1.75, 1.0),
    k(3, 3, "S", 0x16, 2.75, 1.0),
    k(3, 4, "D", 0x07, 3.75, 1.0),
    k(3, 5, "F", 0x09, 4.75, 1.0),
    k(3, 6, "G", 0x0a, 5.75, 1.0),
    k(3, 7, "H", 0x0b, 6.75, 1.0),
    k(3, 8, "J", 0x0d, 7.75, 1.0),
    k(3, 9, "K", 0x0e, 8.75, 1.0),
    k(3, 10, "L", 0x0f, 9.75, 1.0),
    k(3, 11, ";", 0x33, 10.75, 1.0),
    k(3, 12, "'", 0x34, 11.75, 1.0),
    k(3, 14, "Enter", 0x28, 12.75, 2.25),
    k(3, 17, "PgDn", 0x4e, 15.0, 1.0),
    // Bottom row
    k(4, 0, "Shift", 0xe1, 0.0, 2.25),
    k(4, 2, "Z", 0x1d, 2.25, 1.0),
    k(4, 3, "X", 0x1b, 3.25, 1.0),
    k(4, 4, "C", 0x06, 4.25, 1.0),
    k(4, 5, "V", 0x19, 5.25, 1.0),
    k(4, 6, "B", 0x05, 6.25, 1.0),
    k(4, 7, "N", 0x11, 7.25, 1.0),
    k(4, 8, "M", 0x10, 8.25, 1.0),
    k(4, 9, ",", 0x36, 9.25, 1.0),
    k(4, 10, ".", 0x37, 10.25, 1.0),
    k(4, 11, "/", 0x38, 11.25, 1.0),
    k(4, 14, "Shift", 0xe5, 12.25, 1.75),
    k(4, 16, "↑", 0x52, 14.0, 1.0),
    // Modifier row
    k(5, 0, "Ctrl", 0xe0, 0.0, 1.25),
    k(5, 1, "Win", 0xe3, 1.25, 1.25),
    k(5, 2, "Alt", 0xe2, 2.5, 1.25),
    k(5, 6, "", 0x2c, 3.75, 6.25),
    k(5, 10, "Alt", 0xe6, 10.0, 1.0),
    k(5, 12, "Fn", 0, 11.0, 1.0),
    k(5, 13, "Ctrl", 0xe4, 12.0, 1.0),
    k(5, 15, "←", 0x50, 13.0, 1.0),
    k(5, 16, "↓", 0x51, 14.0, 1.0),
    k(5, 17, "→", 0x4f, 15.0, 1.0),
];

/// The key at a matrix slot, if one exists there.
pub fn key_at(pos: KeyPos) -> Option<&'static Key> {
    KEYS.iter().find(|k| k.pos == pos)
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::collections::HashSet;

    #[test]
    fn positions_are_unique_and_in_matrix() {
        let mut seen = HashSet::new();
        for key in &KEYS {
            assert!(key.pos.row < ROWS && key.pos.col < COLS, "{key:?}");
            assert!(seen.insert(key.pos), "duplicate {key:?}");
        }
    }

    #[test]
    fn only_fn_lacks_a_usage() {
        let without: Vec<_> = KEYS
            .iter()
            .filter(|k| k.usage.is_none())
            .map(|k| k.label)
            .collect();
        assert_eq!(without, ["Fn"]);
    }

    #[test]
    fn hardware_confirmed_slots() {
        let label = |row, col| key_at(KeyPos { row, col }).map(|k| k.label);
        assert_eq!(label(1, 0), Some("Esc"));
        assert_eq!(label(2, 17), Some("PgUp"));
        assert_eq!(label(3, 17), Some("PgDn"));
        assert_eq!(label(5, 1), Some("Win"));
        assert_eq!(label(5, 12), Some("Fn"));
        assert_eq!(KeyPos { row: 1, col: 0 }.index(), 22);
    }

    #[test]
    fn keys_do_not_overlap_and_fit_16_units() {
        for row in 1..ROWS {
            let mut keys: Vec<_> = KEYS.iter().filter(|k| k.pos.row == row).collect();
            keys.sort_by(|a, b| a.x.total_cmp(&b.x));
            for pair in keys.windows(2) {
                assert!(
                    pair[0].x + pair[0].w <= pair[1].x,
                    "{:?} overlaps {:?}",
                    pair[0],
                    pair[1]
                );
            }
            assert!(keys.last().is_some_and(|k| k.x + k.w <= 16.0), "row {row}");
        }
    }
}
