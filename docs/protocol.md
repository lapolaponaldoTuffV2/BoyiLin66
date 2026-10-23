# BOYI 66 Pro configuration protocol

This document describes how BoyiLin66 talks to the keyboard. Everything here
was confirmed by sending the command to a real BOYI 66 Pro unless marked
**unconfirmed**.

## Device

| | |
|---|---|
| USB id | `0416:7372` |
| Interfaces | 0: mouse/consumer/system keys · 1: keyboard · **2: configuration** |
| Config interface | HID usage page `0xFF1B`, usage `0x91`, report id `1` |
| Report size | 64 bytes in both directions |

On Linux the configuration interface shows up as one of three `/dev/hidraw*`
nodes. BoyiLin66 picks the one whose report descriptor starts with
`06 1B FF` (Usage Page `0xFF1B`).

## Frame

Every command and every reply is one 64-byte report:

| Byte | Meaning |
|---|---|
| 0 | Report id, always `0x01` |
| 1 | Command |
| 2 | For commands that both read and write: `1` = read, `0` = write |
| 3–4 | `0` |
| 5 | Payload length |
| 6–63 | Payload, zero padded |

Replies repeat the command byte. Some writes get no reply; read the value back
to confirm them.

## Commands

### `0x01` Handshake

Send payload `01` (length 1). Reply payload (length 6) is device information
whose fields are not decoded yet. Send it once after opening the device.

### `0x15` Serial number

Empty payload. The reply payload is a 32-character ASCII string.

### `0x07` Backlight

Read: byte 2 = `1`, empty payload. Reply payload (length 12):

| Offset | Meaning |
|---|---|
| 0 | Effect id (table below) |
| 1 | Brightness, 0–4 |
| 2 | Speed, 0–4 |
| 3–5 | Colour, R G B |
| 6–11 | Effect options, **unconfirmed** |

Write: byte 2 = `0`, length `0x0E`, same payload layout. The keyboard does not
reply; read it back.

| Id | Effect | Id | Effect |
|---|---|---|---|
| 0 | Static | 9 | Twinkle |
| 1 | Breath | 10 | Custom (per-key) |
| 2 | Wave | 11 | Cross |
| 3 | Neon | 12 | Speed respond |
| 4 | Radar | 14 | Auto ripple |
| 5 | Snake | 15 | Striation |
| 6 | Reactive | 16 | Fireworks |
| 7 | Aurora | 100 | Music rhythm |
| 8 | Ripple | | |

### `0x08` Side light

Read with byte 2 = `1`; reply has the same shape as `0x07`. Writing is
**unconfirmed**.

### `0x21` Hall effect settings

All requests use length `0x18` and start with a sub-command byte. Distances
are in 0.1 mm; full travel is 4.0 mm (`40`).

**Key matrix.** Keys are addressed by (row 0–5, column 0–21). Where a command
takes a set of keys it sends 22 bytes, one per column, where bit *n* selects
row *n*. The 66 keys occupy:

| Row | Columns |
|---|---|
| 1 | 0–12, 14 |
| 2 | 0–12, 14, 17 |
| 3 | 0, 2–12, 14, 17 |
| 4 | 0, 2–11, 14, 16 |
| 5 | 0, 1, 2, 6, 10, 12, 13, 15, 16, 17 |

**Sub-commands**

| Payload | Meaning |
|---|---|
| `04` | Read total travel. Reply `04 <travel>` |
| `05 row col` | Read one key. Reply `05 mode press release qt_press qt_release` (length byte says 4, but all six bytes are sent) |
| `mode mask[22] press release qt_press qt_release` | Apply to every key in `mask`. Reply payload `00` on success |
| `06` | Reset all keys to factory sensitivity, **unconfirmed** |
| `09 01 value` | Rate of return, **unconfirmed** |
| `0A 01 value` | Key debounce ("anti-shake"), **unconfirmed** |

`mode` flags: `0x01` = separate release point, `0x0C` = Quick Trigger. When
the release point is not separate, send `release` equal to `press`.

## Not covered yet

Key remapping, macros, DKS / Mod-Tap / Toggle keys, calibration, Win-lock and
sleep timer, per-key custom lighting, side light writes. Firmware updates are
deliberately out of scope.
