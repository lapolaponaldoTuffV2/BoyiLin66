//! Where each physical key sits in the firmware's 6 × 22 key matrix.
//!
//! Positions were found by scanning every matrix slot on real hardware.
//! Labels follow the usual 65 % layout and still need checking key by key.

use serde::{Deserialize, Serialize};

pub const ROWS: u8 = 6;
pub const COLS: u8 = 22;

/// A slot in the key matrix.
#[derive(Debug, Clone, Copy, PartialEq, Eq, Hash, Serialize, Deserialize)]
pub struct KeyPos {
    pub row: u8,
    pub col: u8,
}

/// A physical key: matrix slot plus where to draw it, in key units (1u = one alpha key).
#[derive(Debug, Clone, Serialize)]
pub struct Key {
    pub pos: KeyPos,
    pub label: &'static str,
    pub x: f32,
    pub y: f32,
    pub w: f32,
}

const fn k(row: u8, col: u8, label: &'static str, x: f32, w: f32) -> Key {
    Key {
        pos: KeyPos { row, col },
        label,
        x,
        y: (row - 1) as f32,
        w,
    }
}

/// The 66 keys of the BOYI 66 Pro.
pub static KEYS: [Key; 66] = [
    // Number row
    k(1, 0, "Esc", 0.0, 1.0),
    k(1, 1, "1", 1.0, 1.0),
    k(1, 2, "2", 2.0, 1.0),
    k(1, 3, "3", 3.0, 1.0),
    k(1, 4, "4", 4.0, 1.0),
    k(1, 5, "5", 5.0, 1.0),
    k(1, 6, "6", 6.0, 1.0),
    k(1, 7, "7", 7.0, 1.0),
    k(1, 8, "8", 8.0, 1.0),
    k(1, 9, "9", 9.0, 1.0),
    k(1, 10, "0", 10.0, 1.0),
    k(1, 11, "-", 11.0, 1.0),
    k(1, 12, "=", 12.0, 1.0),
    k(1, 14, "Backspace", 13.0, 2.0),
    // Top row
    k(2, 0, "Tab", 0.0, 1.5),
    k(2, 1, "Q", 1.5, 1.0),
    k(2, 2, "W", 2.5, 1.0),
    k(2, 3, "E", 3.5, 1.0),
    k(2, 4, "R", 4.5, 1.0),
    k(2, 5, "T", 5.5, 1.0),
    k(2, 6, "Y", 6.5, 1.0),
    k(2, 7, "U", 7.5, 1.0),
    k(2, 8, "I", 8.5, 1.0),
    k(2, 9, "O", 9.5, 1.0),
    k(2, 10, "P", 10.5, 1.0),
    k(2, 11, "[", 11.5, 1.0),
    k(2, 12, "]", 12.5, 1.0),
    k(2, 14, "\\", 13.5, 1.5),
    k(2, 17, "Del", 15.0, 1.0),
    // Home row
    k(3, 0, "Caps", 0.0, 1.75),
    k(3, 2, "A", 1.75, 1.0),
    k(3, 3, "S", 2.75, 1.0),
    k(3, 4, "D", 3.75, 1.0),
    k(3, 5, "F", 4.75, 1.0),
    k(3, 6, "G", 5.75, 1.0),
    k(3, 7, "H", 6.75, 1.0),
    k(3, 8, "J", 7.75, 1.0),
    k(3, 9, "K", 8.75, 1.0),
    k(3, 10, "L", 9.75, 1.0),
    k(3, 11, ";", 10.75, 1.0),
    k(3, 12, "'", 11.75, 1.0),
    k(3, 14, "Enter", 12.75, 2.25),
    k(3, 17, "PgUp", 15.0, 1.0),
    // Bottom row
    k(4, 0, "Shift", 0.0, 2.25),
    k(4, 2, "Z", 2.25, 1.0),
    k(4, 3, "X", 3.25, 1.0),
    k(4, 4, "C", 4.25, 1.0),
    k(4, 5, "V", 5.25, 1.0),
    k(4, 6, "B", 6.25, 1.0),
    k(4, 7, "N", 7.25, 1.0),
    k(4, 8, "M", 8.25, 1.0),
    k(4, 9, ",", 9.25, 1.0),
    k(4, 10, ".", 10.25, 1.0),
    k(4, 11, "/", 11.25, 1.0),
    k(4, 14, "Shift", 12.25, 1.75),
    k(4, 16, "↑", 14.0, 1.0),
    // Modifier row
    k(5, 0, "Ctrl", 0.0, 1.25),
    k(5, 1, "Win", 1.25, 1.25),
    k(5, 2, "Alt", 2.5, 1.25),
    k(5, 6, "", 3.75, 6.25),
    k(5, 10, "Alt", 10.0, 1.0),
    k(5, 12, "Fn", 11.0, 1.0),
    k(5, 13, "Ctrl", 12.0, 1.0),
    k(5, 15, "←", 13.0, 1.0),
    k(5, 16, "↓", 14.0, 1.0),
    k(5, 17, "→", 15.0, 1.0),
];

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
