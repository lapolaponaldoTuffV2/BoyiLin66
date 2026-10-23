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

## Next

In priority order. Each item: decode → confirm on hardware → crate module with
tests of the captured bytes → Tauri command → UI → update `protocol.md`.

1. **Calibration** (`0x21`): per key and all keys, with status replies.
2. **Sensitivity extras** (`0x21`): rate of return, debounce, reset to factory.
3. **Lighting extras**: per-key colour (`0x09`, decoded and confirmed), side light
   writes (`0x08`), the six effect option bytes of `0x07`.
4. **System** (`0x14`): Windows-key lock, sleep timer, factory reset.
5. **Packaging**: AppImage, `.deb`, `.rpm`, install script.

## Open questions

- Mouse actions in the keymap are encoded but not confirmed on hardware.
- Mouse-button steps in macros are decoded but not implemented or confirmed.
- Two-modifier shortcuts are encoded but not confirmed.
- The Fn layer (`0x18`, layer `2`) is not mapped; only the base layer is written.
- The handshake reply fields are not decoded.

## Never

Firmware updates and serial-number writes: a mistake there can brick the keyboard.
