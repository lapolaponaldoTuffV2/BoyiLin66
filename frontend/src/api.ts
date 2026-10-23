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

/** Distances are in 0.1 mm units, as the firmware stores them. */
export type TriggerSettings = {
  press: number;
  release: number;
  separate: boolean;
  quick_trigger: boolean;
  qt_press: number;
  qt_release: number;
};

export type MediaKey = "VolumeUp" | "VolumeDown" | "Mute" | "PlayPause" | "NextTrack" | "PreviousTrack"
  | "Stop" | "MediaPlayer" | "Calculator" | "Computer" | "Email" | "Browser" | "Search"
  | "BrightnessUp" | "BrightnessDown";
export type MouseAction = "Left" | "Right" | "Middle" | "Back" | "Forward" | "ScrollUp" | "ScrollDown";
export type KeyAction = { kind: "disabled" } | { kind: "key"; usage: number } | { kind: "fn" }
  | { kind: "shortcut"; modifiers: number; usage: number }
  | { kind: "media"; key: MediaKey } | { kind: "mouse"; action: MouseAction };
/** 132 matrix slots, including empty positions, in row-major order. */
export type Keymap = KeyAction[];

export const api = {
  layout: () => invoke<Key[]>("layout"),
  deviceInfo: () => invoke<DeviceInfo>("device_info"),
  getLed: () => invoke<LedConfig>("get_led"),
  setLed: (config: LedConfig) => invoke<LedConfig>("set_led", { config }),
  getKeyTrigger: (key: KeyPos) => invoke<TriggerSettings>("get_key_trigger", { key }),
  setTrigger: (keys: KeyPos[], settings: TriggerSettings) => invoke<void>("set_trigger", { keys, settings }),
  getKeymap: () => invoke<Keymap>("get_keymap"),
  factoryKeymap: () => invoke<Keymap>("factory_keymap"),
  setKeymap: (keymap: Keymap) => invoke<void>("set_keymap", { keymap }),
};

export const posId = (p: KeyPos) => `${p.row}:${p.col}`;
