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
| 3 | `0` |
| 4 | Packet index in multi-packet transfers, otherwise `0` |
| 5 | Payload length |
| 6–63 | Payload, zero padded |

Replies repeat the command byte. Some writes get no reply; read the value back
to confirm them.

## Key matrix

Keys are addressed by (row 0–5, column 0–21). Commands that cover every key
walk all 132 slots in row-major order (`index = row × 22 + column`), empty
slots included. The 66 keys occupy:

| Row | Columns |
|---|---|
| 1 | 0–12, 14 |
| 2 | 0–12, 14, 17 (17 = PgUp) |
| 3 | 0, 2–12, 14, 17 (17 = PgDn) |
| 4 | 0, 2–11, 14, 16 |
| 5 | 0, 1, 2, 6, 10, 12 (Fn), 13, 15, 16, 17 |

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

Where a command takes a set of keys it sends 22 bytes, one per column, where
bit *n* selects row *n*.

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

### `0x09` Per-key colour

Used by the Custom effect. 132 slots × 3 bytes (R G B), 18 slots per packet,
8 packets; byte 2 = custom slot (`0`), byte 4 = packet index. No reply. Then
select effect 10 (Custom) with `0x07`.

### `0x18` Key assignments

Writes one whole layer: 132 slots × 4 bytes, 14 slots per packet, 10 packets
(the last carries 6 slots). Byte 2 = layer (`0` = base), byte 4 = packet
index. Each packet is acknowledged with a reply that echoes the command,
declares length 0 and carries status `00` in byte 6; the packet index is not
echoed, so send one packet at a time. There is no way to read a layer back,
and a write that fails part-way leaves the earlier packets applied.

| Bytes | Action |
|---|---|
| `00 00 00 00` | Disabled |
| `00 usage 00 00` | HID keyboard usage (modifiers `E0`–`E7` included) |
| `01 00 00 00` | Fn |
| `13 mod usage 00` · `13 mod1 mod2 usage` | Shortcut; modifiers as HID usages (two-modifier form **unconfirmed**) |
| `07 code 00 00` | Media key (codes in `keymap.rs`; Mute `12` confirmed) |
| `12 00 buttons 00` · `12 01 step 00` | Mouse button mask / wheel step, **unconfirmed** |
| `17 slot 00 00` | Advanced key stored in slot `slot` (see `0x22`) |
| `10 00 slot 00` | Macro stored in slot `slot` (see `0x19`) |

### `0x19` Macros

10 slots of 256 bytes. Byte 2 = slot, byte 4 = packet 0–4; packets 0–3 carry
58 bytes (length `0x3A`), packet 4 the last 24 (length `0x18`). Each packet is
acknowledged like a keymap packet. Write the slots before the keymap that
refers to them; an all-zero slot is empty, and emptying a slot stops it if it
is playing.

The 256 bytes are an 8-byte header followed by up to 62 four-byte steps, zero
padded:

| Header byte | Meaning |
|---|---|
| 1 | Playback: `0` once per press (also when held), `1` repeat `count` times, `2` a press starts repeating and the next press stops, `3` repeat while held |
| 3 | Length of the steps in bytes (steps × 4) |
| 5 | `count` for playback `1` |

Others are zero. A step is `usage flags delay_hi delay_lo`: a HID keyboard
usage, flags `10` for a press or `00` for a release, then the pause after the
step in milliseconds, big-endian. When a macro repeats, the pause after the
last step separates the repetitions. Flag bit 0 marks a mouse-button step
(usage `1` left, `2` right, `4` middle), **unconfirmed** and not used by the crate.

### `0x22` Advanced keys

40 slots; byte 2 = slot, length `0x32`. An all-zero payload empties a slot.
Each write is acknowledged with payload `00`. Write the slots before the
keymap that refers to them. Actions inside use the 4-byte key/shortcut
encoding from `0x18`.

| Payload | Function |
|---|---|
| `02 hold[4] tap[4] time` | Mod-Tap: `tap` when tapped, `hold` while held longer than `time` × 10 ms |
| `03 action[4]` | Toggle: first press holds `action` down, the next press releases it |
| `01 points[4] (action[4] stages[4]) × 4` | DKS |

**DKS.** `points` are four depths in 0.1 mm: press, bottom, leaving the
bottom, release (the official software uses 1.5 / 3.6 / 3.6 / 1.5 mm). Each of
the four bindings is an action followed by one byte per stage:

| Value | At this stage |
|---|---|
| `0` | Nothing |
| `1` | Tap (press and release) |
| `2` | Press, release at the next stage |

A `3` is also accepted but behaves like `2`, with a release and re-press at
the stage boundary. A press that never reaches the bottom only crosses the
first and last stages.

### `0x14` System

Payload starts with a sub-command: `01` factory reset, `02` Windows-key lock,
`03` sleep timer. All **unconfirmed**.

## Not covered yet

Calibration, Win-lock and sleep timer, side light writes, the Fn layer. Firmware updates are
deliberately out of scope.
