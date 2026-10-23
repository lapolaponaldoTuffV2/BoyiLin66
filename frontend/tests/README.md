# UI validation

Run from the repository root after installing frontend dependencies:

```bash
npm --prefix frontend exec -- playwright install chromium
npm --prefix frontend run test:ui
```

Playwright starts a separate Vite server on port 5174. All Tauri commands are
mocked inside the browser; tests never open or configure the keyboard.
Screenshots of both screens are saved under `frontend/test-results/`.
