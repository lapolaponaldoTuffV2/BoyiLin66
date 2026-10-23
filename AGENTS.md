# Working on BoyiLin66

Linux configurator for the BOYI 66 Pro magnetic keyboard. Tauri 2 app with a pure-Rust
protocol crate and a React + TypeScript UI.

Start with [`docs/ROADMAP.md`](docs/ROADMAP.md) (what is done and what is next) and
[`docs/protocol.md`](docs/protocol.md) (wire format).

## Layout

- `crates/boyi-protocol` — protocol and hidraw access. No Tauri; std + serde + thiserror only
  (serde_json for tests). One module per feature: `led`, `magnetic`, `keymap`, `advanced`, `macros`,
  `layout` (66 keys, matrix positions, default HID usages), `frame`, `device` (`Keyboard`).
- `crates/boyi-protocol/examples` — `info` (read-only status), `restore_keymap` (factory layout).
- `src-tauri` — thin Tauri commands over the crate. The keyboard cannot report its keymap, so
  `set_keymap` keeps the last written map in the app data dir (`keymap.json`).
- `frontend` — React UI. Dark theme tokens in `src/styles.css`; icons are inline SVG paths in
  `src/ui.tsx`; Playwright tests with mocked IPC in `frontend/tests`.
- `docs/protocol.md` — wire format, kept in sync with the crate.

## Conventions

- Code, comments and docs in English; UI text in Portuguese (pt-BR).
- Builders and parsers are pure functions; `Keyboard` methods do the I/O.
- Every byte sequence confirmed on hardware gets a unit test using the captured bytes.
  Unconfirmed encodings are marked as such in `protocol.md` and in the UI ("beta").
- Validate inputs at the crate boundary (`Error::OutOfRange`); never send unvalidated values.
- Keymap writes replace the whole base layer and every macro and advanced-key slot. A keymap must keep
  exactly one Fn on a physical key; empty matrix slots stay disabled.
- Never implement firmware update or serial-number writing.
- This project is clean-room: do not add code, assets or text from the official Windows software.

## Checks

```bash
cargo test --workspace
cargo clippy --workspace --all-targets -- -D warnings
cargo fmt --all --check
npm run build
npm --prefix frontend run test:ui
```

## Touching the keyboard

Writes change the keyboard's stored configuration. Only test a write with the owner's explicit
consent, say how it will be undone, and restore afterwards (`restore_keymap` for key changes).
Hardware commands must hold the shared lock so two tools never talk to the keyboard at once:

```bash
flock /tmp/boyi66.lock cargo run -p boyi-protocol --example info
```
