import { AdvancedKey, DksPoints, Key, KeyAction, KeyPos, MediaKey, MouseAction, StageAction } from "./api";

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

/** Firmware slots for Mod-Tap, Toggle and DKS keys. */
export const ADVANCED_SLOTS = 40;
/** The four DKS stages, each triggered at its own depth. */
export const DKS_STAGES: { point: keyof DksPoints; label: string }[] = [
  { point: "press", label: "Pressionar" }, { point: "bottom", label: "Fundo" },
  { point: "bottom_release", label: "Saindo do fundo" }, { point: "release", label: "Soltar" },
];
export const STAGE_NAMES: Record<StageAction, string> = { none: "—", tap: "Tocar", hold: "Segurar" };

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
    case "advanced": return advancedName(action.key);
  }
}

function advancedName(key: AdvancedKey): string {
  switch (key.type) {
    case "mod_tap": return `Mod-Tap: toque ${actionName(key.tap)}, segurar ${actionName(key.hold)}`;
    case "toggle": return `Toggle: ${actionName(key.key)}`;
    case "dks": return `DKS: ${key.bindings.flatMap((binding) => binding ? [actionName(binding.key)] : []).join(", ")}`;
  }
}

export function sameAction(a: KeyAction, b: KeyAction): boolean {
  switch (a.kind) {
    case "key": return b.kind === "key" && a.usage === b.usage;
    case "shortcut": return b.kind === "shortcut" && a.usage === b.usage && a.modifiers === b.modifiers;
    case "media": return b.kind === "media" && a.key === b.key;
    case "mouse": return b.kind === "mouse" && a.action === b.action;
    case "advanced": return b.kind === "advanced" && sameAdvanced(a.key, b.key);
    default: return a.kind === b.kind;
  }
}

function sameAdvanced(a: AdvancedKey, b: AdvancedKey): boolean {
  switch (a.type) {
    case "mod_tap": return b.type === "mod_tap" && a.hold_ms === b.hold_ms && sameAction(a.hold, b.hold) && sameAction(a.tap, b.tap);
    case "toggle": return b.type === "toggle" && sameAction(a.key, b.key);
    case "dks": return b.type === "dks" && DKS_STAGES.every(({ point }) => a.points[point] === b.points[point])
      && a.bindings.every((x, i) => {
        const y = b.bindings[i];
        return x && y ? sameAction(x.key, y.key) && x.stages.every((stage, j) => stage === y.stages[j]) : x === y;
      });
  }
}

function strokeProblem(stroke: any): string | null {
  const usageValid = Number.isInteger(stroke?.usage) && stroke.usage > 0 && stroke.usage <= 255;
  switch (stroke?.kind) {
    case "key": return usageValid ? null : "Uso de tecla inválido.";
    case "shortcut":
      return !usageValid || (stroke.usage >= 0xe0 && stroke.usage <= 0xe7)
        || !Number.isInteger(stroke.modifiers) || stroke.modifiers < 1 || stroke.modifiers > 255
        || modifierCount(stroke.modifiers) > 2 ? "Um atalho precisa de 1–2 modificadores e uma tecla comum." : null;
    default: return "O mapa contém uma tecla inválida.";
  }
}

/** Mirrors the protocol crate's rules, so the draft is checked before anything is sent. */
function advancedProblem(key: any): string | null {
  switch (key?.type) {
    case "mod_tap":
      if (!Number.isInteger(key.hold_ms) || key.hold_ms < 10 || key.hold_ms > 2550 || key.hold_ms % 10) {
        return "O tempo do Mod-Tap precisa ficar entre 10 e 2550 ms, em passos de 10 ms.";
      }
      return strokeProblem(key.hold) || strokeProblem(key.tap);
    case "toggle": return strokeProblem(key.key);
    case "dks": {
      const points = key.points;
      if (DKS_STAGES.some(({ point }) => !Number.isInteger(points?.[point]) || points[point] < 1 || points[point] > 40)) {
        return "Os pontos do DKS precisam ficar entre 0,1 e 4,0 mm.";
      }
      if (points.press >= points.bottom || points.release >= points.bottom_release) {
        return "No DKS, os pontos de pressionar e de soltar precisam ficar acima dos pontos de fundo.";
      }
      if (!Array.isArray(key.bindings) || key.bindings.length !== 4) return "O DKS precisa de 4 posições de tecla.";
      for (const binding of key.bindings) {
        if (binding === null) continue;
        if (!Array.isArray(binding?.stages) || binding.stages.length !== 4
          || binding.stages.some((stage: unknown) => !Object.hasOwn(STAGE_NAMES, stage as string))) return "Etapa de DKS inválida.";
        if (binding.stages[3] === "hold") return "No DKS, segurar não pode começar na etapa de soltar.";
        const problem = strokeProblem(binding.key);
        if (problem) return problem;
      }
      return key.bindings.some((binding: { stages: StageAction[] } | null) => binding?.stages.some((stage) => stage !== "none"))
        ? null : "O DKS precisa de pelo menos uma ação em alguma etapa.";
    }
    default: return "O mapa contém uma tecla avançada desconhecida.";
  }
}

/** Local files can be malformed even when their JSON has the expected length. */
export function keymapProblem(value: unknown, keys: Key[]): string | null {
  if (!Array.isArray(value) || value.length !== 132) return "O mapa precisa conter 132 posições.";
  const fnSlots: number[] = [];
  let advanced = 0;
  for (const [index, action] of value.entries()) {
    if (!action || typeof action !== "object") return "O mapa contém uma ação inválida.";
    let problem: string | null = null;
    switch (action.kind) {
      case "disabled": break;
      case "fn": fnSlots.push(index); break;
      case "key": case "shortcut": problem = strokeProblem(action); break;
      case "advanced": advanced++; problem = advancedProblem(action.key); break;
      case "media": if (!Object.hasOwn(MEDIA_NAMES, action.key)) return "Ação multimídia inválida."; break;
      case "mouse": if (!Object.hasOwn(MOUSE_NAMES, action.action)) return "Ação de mouse inválida."; break;
      default: return "O mapa contém uma ação desconhecida.";
    }
    if (problem) return problem;
  }
  if (advanced > ADVANCED_SLOTS) return `O teclado guarda no máximo ${ADVANCED_SLOTS} teclas avançadas (Mod-Tap, Toggle e DKS).`;
  if (fnSlots.length !== 1 || !keys.some((key) => keyIndex(key.pos) === fnSlots[0])) {
    return "O mapa precisa manter exatamente uma tecla Fn física.";
  }
  return null;
}
