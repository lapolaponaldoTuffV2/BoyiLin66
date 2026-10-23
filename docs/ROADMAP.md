# Roadmap

Status of every keyboard feature. "Protocol" means implemented in
`crates/boyi-protocol` and confirmed on a real BOYI 66 Pro; "UI" means usable
from the app. Wire details are in [`protocol.md`](protocol.md).

## Done

| Feature | Protocol | UI |
|---|---|---|
| Device discovery, handshake, serial number | ✅ | ✅ |
| Backlight effect, colour, brightness, speed (`0x07`) | ✅ | ✅ Iluminação |
| Actuation point, separate release, Quick Trigger (`0x21`) | ✅ | ✅ Acionamento |
| Key remapping: keys, shortcuts, media, disable (`0x18`) | ✅ | ✅ Teclas |
| Mod-Tap, Toggle, DKS (`0x22`) | ✅ | ✅ Teclas |
| Macros: key steps with pauses, four playback modes (`0x19`) | ✅ | ✅ Teclas |
| Per-key colour for the Custom effect (`0x09`) | ✅ | ✅ Iluminação |
| Per-key calibration (`0x21` subs `02`, `07`) | ✅ | ✅ Acionamento |
| Packaging: AppImage + `install.sh`, `.deb`/`.rpm` with the udev rule applied on install | ✅ | — |
| Sleep timers, what Win lock blocks (`0x14`) | sleep read ✅, writes 🧪 | 🧪 Sistema |
| Debounce, report rate, factory sensitivity reset (`0x21` subs `0A`, `09`, `06`) | reads ✅, writes 🧪 | 🧪 Acionamento |

## Next

In priority order. Each item: decode → confirm on hardware → crate module with
tests of the captured bytes → Tauri command → UI → update `protocol.md`.

1. **Lighting options**: give the six `0x07` option bytes (direction, colour mode) their own controls; today they are kept as read.
2. **Factory reset** (`0x14`): decoded, to be tested with the owner present.
3. **First release**: publish the AppImage, `.deb` and `.rpm` on GitHub (the install script fetches the latest release).

## Open questions

- Mouse actions in the keymap are encoded but not confirmed on hardware.
- All-keys calibration (status sub `08` with a column mask) is not implemented.
- Mouse-button steps in macros are decoded but not implemented or confirmed.
- Two-modifier shortcuts are encoded but not confirmed.
- The Fn layer (`0x18`, layer `2`) is not mapped; only the base layer is written.
- The handshake reply fields are not decoded.

## Never

Firmware updates and serial-number writes: a mistake there can brick the keyboard.
