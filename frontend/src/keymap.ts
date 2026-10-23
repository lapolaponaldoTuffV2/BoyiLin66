import { Key, KeyAction, KeyPos, MediaKey, MouseAction } from "./api";

export const MODIFIERS = [
  { code: "ControlLeft", label: "Ctrl esquerdo" }, { code: "ShiftLeft", label: "Shift esquerdo" },
  { code: "AltLeft", label: "Alt esquerdo" }, { code: "MetaLeft", label: "Super esquerdo" },
  { code: "ControlRight", label: "Ctrl direito" }, { code: "ShiftRight", label: "Shift direito" },
  { code: "AltRight", label: "Alt direito" }, { code: "MetaRight", label: "Super direito" },
].map((key, i) => ({ ...key, usage: 0xe0 + i, bit: 1 << i }));

// KeyboardEvent.code follows the physical key, regardless of the OS keyboard layout.
export const KEY_OPTIONS = [
  ...Array.from("ABCDEFGHIJKLMNOPQRSTUVWXYZ", (label, i) => ({ code: `Key${label}`, label, usage: 4 + i })),
  ...Array.from("1234567890", (label, i) => ({ code: `Digit${label}`, label, usage: 0x1e + i })),
  ...([
    ["Enter", "Enter", 0x28], ["Escape", "Esc", 0x29], ["Backspace", "Backspace", 0x2a],
    ["Tab", "Tab", 0x2b], ["Space", "Espaço", 0x2c], ["Minus", "-", 0x2d], ["Equal", "=", 0x2e],
    ["BracketLeft", "[", 0x2f], ["BracketRight", "]", 0x30], ["Backslash", "\\", 0x31],
    ["Semicolon", ";", 0x33], ["Quote", "'", 0x34], ["Backquote", "`", 0x35],
    ["Comma", ",", 0x36], ["Period", ".", 0x37], ["Slash", "/", 0x38], ["CapsLock", "Caps Lock", 0x39],
    ["PrintScreen", "Print Screen", 0x46], ["ScrollLock", "Scroll Lock", 0x47], ["Pause", "Pause", 0x48],
    ["Insert", "Insert", 0x49], ["Home", "Home", 0x4a], ["PageUp", "PgUp", 0x4b],
    ["Delete", "Delete", 0x4c], ["End", "End", 0x4d], ["PageDown", "PgDn", 0x4e],
    ["ArrowRight", "→", 0x4f], ["ArrowLeft", "←", 0x50], ["ArrowDown", "↓", 0x51], ["ArrowUp", "↑", 0x52],
    ["NumLock", "Num Lock", 0x53], ["NumpadDivide", "Num /", 0x54], ["NumpadMultiply", "Num *", 0x55],
    ["NumpadSubtract", "Num -", 0x56], ["NumpadAdd", "Num +", 0x57], ["NumpadEnter", "Num Enter", 0x58],
    ["NumpadDecimal", "Num .", 0x63], ["IntlBackslash", "\\ internacional", 0x64],
    ["ContextMenu", "Menu", 0x65], ["IntlRo", "Ro internacional", 0x87], ["IntlYen", "¥ internacional", 0x89],
  ] as const).map(([code, label, usage]) => ({ code, label, usage })),
  ...Array.from({ length: 24 }, (_, i) => ({ code: `F${i + 1}`, label: `F${i + 1}`, usage: i < 12 ? 0x3a + i : 0x68 + i - 12 })),
  ...Array.from("1234567890", (n, i) => ({ code: `Numpad${n}`, label: `Num ${n}`, usage: 0x59 + i })),
  ...MODIFIERS,
];

export const MEDIA_NAMES: Record<MediaKey, string> = {
  VolumeUp: "Aumentar volume", VolumeDown: "Diminuir volume", Mute: "Mudo", PlayPause: "Reproduzir / pausar",
  NextTrack: "Próxima faixa", PreviousTrack: "Faixa anterior", Stop: "Parar", MediaPlayer: "Player de mídia",
  Calculator: "Calculadora", Computer: "Computador", Email: "E-mail", Browser: "Navegador", Search: "Pesquisar",
  BrightnessUp: "Aumentar brilho", BrightnessDown: "Diminuir brilho",
};
export const MOUSE_NAMES: Record<MouseAction, string> = {
  Left: "Clique esquerdo", Right: "Clique direito", Middle: "Clique do meio", Back: "Voltar", Forward: "Avançar",
  ScrollUp: "Rolar para cima", ScrollDown: "Rolar para baixo",
};

export const keyIndex = (pos: KeyPos) => pos.row * 22 + pos.col;
export const modifierCount = (bits: number) => MODIFIERS.filter((modifier) => bits & modifier.bit).length;
const keyName = (usage: number) => KEY_OPTIONS.find((key) => key.usage === usage)?.label
  ?? `HID 0x${usage.toString(16).toUpperCase()}`;

export function actionName(action: KeyAction): string {
  switch (action.kind) {
    case "disabled": return "Desativada";
    case "fn": return "Fn";
    case "key": return keyName(action.usage);
    case "shortcut": return [...MODIFIERS.filter((m) => action.modifiers & m.bit).map((m) => m.label), keyName(action.usage)].join(" + ");
    case "media": return MEDIA_NAMES[action.key];
    case "mouse": return `${MOUSE_NAMES[action.action]} · beta`;
  }
}

export function sameAction(a: KeyAction, b: KeyAction): boolean {
  switch (a.kind) {
    case "key": return b.kind === "key" && a.usage === b.usage;
    case "shortcut": return b.kind === "shortcut" && a.usage === b.usage && a.modifiers === b.modifiers;
    case "media": return b.kind === "media" && a.key === b.key;
    case "mouse": return b.kind === "mouse" && a.action === b.action;
    default: return a.kind === b.kind;
  }
}

/** Local files can be malformed even when their JSON has the expected length. */
export function keymapProblem(value: unknown, keys: Key[]): string | null {
  if (!Array.isArray(value) || value.length !== 132) return "O mapa precisa conter 132 posições.";
  const fnSlots: number[] = [];
  for (const [index, action] of value.entries()) {
    if (!action || typeof action !== "object") return "O mapa contém uma ação inválida.";
    const usageValid = Number.isInteger(action.usage) && action.usage > 0 && action.usage <= 255;
    switch (action.kind) {
      case "disabled": break;
      case "fn": fnSlots.push(index); break;
      case "key": if (!usageValid) return "Uso de tecla inválido."; break;
      case "shortcut":
        if (!usageValid || (action.usage >= 0xe0 && action.usage <= 0xe7)
          || !Number.isInteger(action.modifiers) || action.modifiers < 1 || action.modifiers > 255
          || modifierCount(action.modifiers) > 2) return "Um atalho precisa de 1–2 modificadores e uma tecla comum.";
        break;
      case "media": if (!Object.hasOwn(MEDIA_NAMES, action.key)) return "Ação multimídia inválida."; break;
      case "mouse": if (!Object.hasOwn(MOUSE_NAMES, action.action)) return "Ação de mouse inválida."; break;
      default: return "O mapa contém uma ação desconhecida.";
    }
  }
  if (fnSlots.length !== 1 || !keys.some((key) => keyIndex(key.pos) === fnSlots[0])) {
    return "O mapa precisa manter exatamente uma tecla Fn física.";
  }
  return null;
}
