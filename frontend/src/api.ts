import { invoke } from "@tauri-apps/api/core";

export type KeyPos = { row: number; col: number };
export type Key = { pos: KeyPos; label: string; usage: number | null; x: number; y: number; w: number };
export type DeviceInfo = { path: string; serial: string; handshake: number[] };

export const LED_MODES = [
  "Static", "Breath", "Wave", "Neon", "Radar", "Snake", "Reactive", "Aurora", "Ripple",
  "Twinkle", "Custom", "Cross", "SpeedRespond", "AutoRipple", "Striation", "Fireworks", "MusicRhythm",
] as const;
export type LedMode = (typeof LED_MODES)[number];
export type LedConfig = { mode: LedMode; brightness: number; speed: number; color: [number, number, number] };
export const SIDE_MODES = ["Static", "Breath", "Wave", "Collision", "Neon", "Off"] as const;
/** `options` are six effect bytes of unknown meaning, sent back as read. */
export type SideLight = {
  mode: (typeof SIDE_MODES)[number]; brightness: number; speed: number;
  color: [number, number, number]; options: number[];
};
/** Seconds; `never` turns sleep off. */
export type Sleep = { light_s: number; keyboard_s: number; never: boolean };
/** What stays blocked while Win lock is on. The keyboard cannot report it. */
export type WinLock = { windows: boolean; shift_tab: boolean; alt_tab: boolean; alt_f4: boolean };
/** Custom-effect colours: 132 matrix slots, including empty positions, in row-major order. */
export type KeyColors = [number, number, number][];

/** Distances are in 0.1 mm units, as the firmware stores them. */
export type TriggerSettings = {
  press: number;
  release: number;
  separate: boolean;
  quick_trigger: boolean;
  qt_press: number;
  qt_release: number;
};

/** Keyboard-wide timing: debounce level 0–7, report rate 1, 2, 4 or 8 kHz. */
export type Performance = { debounce: number; report_rate_khz: number };

export type MediaKey = "VolumeUp" | "VolumeDown" | "Mute" | "PlayPause" | "NextTrack" | "PreviousTrack"
  | "Stop" | "MediaPlayer" | "Calculator" | "Computer" | "Email" | "Browser" | "Search"
  | "BrightnessUp" | "BrightnessDown";
export type MouseAction = "Left" | "Right" | "Middle" | "Back" | "Forward" | "ScrollUp" | "ScrollDown";
/** What advanced keys can send: a key or a shortcut. */
export type KeyStroke = { kind: "key"; usage: number } | { kind: "shortcut"; modifiers: number; usage: number };
/** Per DKS stage: nothing, press and release, or press and release at the next stage. */
export type StageAction = "none" | "tap" | "hold";
/** Distances are in 0.1 mm units. */
export type DksPoints = { press: number; bottom: number; bottom_release: number; release: number };
/** `stages` holds stages 1–4: press, bottom, leaving the bottom, release. */
export type DksBinding = { key: KeyStroke; stages: StageAction[] };
export type AdvancedKey = { type: "mod_tap"; hold: KeyStroke; tap: KeyStroke; hold_ms: number }
  | { type: "toggle"; key: KeyStroke }
  | { type: "dks"; points: DksPoints; bindings: (DksBinding | null)[] };
export type Playback = { type: "once" } | { type: "repeat"; count: number } | { type: "toggle" } | { type: "while_held" };
/** A key press or release; `delay_ms` is the pause after it (after the last step, between repeats). */
export type MacroStep = { usage: number; down: boolean; delay_ms: number };
export type MacroAction = { kind: "macro"; playback: Playback; steps: MacroStep[] };
export type KeyAction = { kind: "disabled" } | KeyStroke | { kind: "fn" }
  | { kind: "media"; key: MediaKey } | { kind: "mouse"; action: MouseAction }
  | { kind: "advanced"; key: AdvancedKey } | MacroAction;
/** 132 matrix slots, including empty positions, in row-major order. */
export type Keymap = KeyAction[];

export const api = {
  layout: () => invoke<Key[]>("layout"),
  deviceInfo: () => invoke<DeviceInfo>("device_info"),
  getLed: () => invoke<LedConfig>("get_led"),
  setLed: (config: LedConfig) => invoke<LedConfig>("set_led", { config }),
  getSideLight: () => invoke<SideLight>("get_side_light"),
  setSideLight: (side: SideLight) => invoke<SideLight>("set_side_light", { side }),
  getSleep: () => invoke<Sleep>("get_sleep"),
  setSleep: (sleep: Sleep) => invoke<Sleep>("set_sleep", { sleep }),
  getWinLock: () => invoke<WinLock>("get_win_lock"),
  setWinLock: (winLock: WinLock) => invoke<void>("set_win_lock", { winLock }),
  getKeyColors: () => invoke<KeyColors>("get_key_colors"),
  setKeyColors: (colors: KeyColors) => invoke<void>("set_key_colors", { colors }),
  getKeyTrigger: (key: KeyPos) => invoke<TriggerSettings>("get_key_trigger", { key }),
  setTrigger: (keys: KeyPos[], settings: TriggerSettings) => invoke<void>("set_trigger", { keys, settings }),
  getPerformance: () => invoke<Performance>("get_performance"),
  setPerformance: (performance: Performance) => invoke<Performance>("set_performance", { performance }),
  resetSensitivity: () => invoke<void>("reset_sensitivity"),
  /** Resolves true when the keyboard reports success; the user must press the key meanwhile. */
  calibrateKey: (key: KeyPos) => invoke<boolean>("calibrate_key", { key }),
  getKeymap: () => invoke<Keymap>("get_keymap"),
  factoryKeymap: () => invoke<Keymap>("factory_keymap"),
  setKeymap: (keymap: Keymap) => invoke<void>("set_keymap", { keymap }),
};

export const posId = (p: KeyPos) => `${p.row}:${p.col}`;
