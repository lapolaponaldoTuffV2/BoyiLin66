//! Writes the factory base layer, undoing every key remap.
//!
//! ```sh
//! cargo run -p boyi-protocol --example restore_keymap
//! ```

use boyi_protocol::keymap::Keymap;
use boyi_protocol::Keyboard;

fn main() -> boyi_protocol::Result<()> {
    let kb = Keyboard::open_first()?;
    kb.write_keymap(&Keymap::factory())?;
    println!("factory key layout written to {}", kb.path().display());
    Ok(())
}
