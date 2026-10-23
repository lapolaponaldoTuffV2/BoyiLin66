# Working on BoyiLin66

Linux configurator for the BOYI 66 Pro magnetic keyboard. Tauri 2 app with a pure-Rust
protocol crate and a React + TypeScript UI.

## Layout

- `crates/boyi-protocol` — protocol and hidraw access. No Tauri, std + serde + thiserror only.
- `src-tauri` — thin Tauri commands over the crate.
- `frontend` — React UI. Dark theme tokens in `src/styles.css`; icons are inline SVG paths in `src/ui.tsx`.
- `docs/protocol.md` — wire format, kept in sync with the crate.

## Conventions

- Code, comments and docs in English; UI text in Portuguese (pt-BR).
- One module per keyboard feature in the crate. Builders and parsers are pure functions;
  `Keyboard` methods do the I/O.
- Every byte sequence confirmed on hardware gets a unit test using the captured bytes.
- Validate inputs at the crate boundary (`Error::OutOfRange`); never send unvalidated values.
- Never implement firmware update or serial-number writing.
- This project is clean-room: do not add code, assets or text from the official Windows software.

## Checks

```bash
cargo test -p boyi-protocol
cargo clippy --workspace
cargo fmt --all --check
npm --prefix frontend run build
```

Hardware commands must hold the shared lock so two tools never talk to the keyboard at once:

```bash
flock /tmp/boyi66.lock cargo run -p boyi-protocol --example info
```
