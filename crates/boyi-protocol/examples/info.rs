//! Prints what the keyboard reports, without changing anything.
//!
//! ```sh
//! cargo run -p boyi-protocol --example info
//! ```

use boyi_protocol::layout::KEYS;
use boyi_protocol::Keyboard;

fn main() -> boyi_protocol::Result<()> {
    let kb = Keyboard::open_first()?;
    let info = kb.info()?;
    println!("device   {}", info.path.display());
    println!("serial   {}", info.serial);
    println!("lighting {:?}", kb.led()?);
    println!("side     {:?}", kb.side_light()?);
    let perf = kb.performance()?;
    println!(
        "timing   debounce {}  report rate {} kHz",
        perf.debounce, perf.report_rate_khz
    );
    for key in KEYS
        .iter()
        .filter(|k| ["Esc", "W", "A", "S", "D"].contains(&k.label))
    {
        let t = kb.key_trigger(key.pos)?;
        println!(
            "{:<8} press {:.1} mm  release {:.1} mm  quick trigger {}",
            key.label,
            t.press as f32 / 10.0,
            t.release as f32 / 10.0,
            t.quick_trigger
        );
    }
    Ok(())
}
