import { expect, test as base } from "@playwright/test";
import type { KeyAction } from "../src/api";
import layout from "./fixtures/layout.json" with { type: "json" };

expect(layout).toHaveLength(66);

export { expect };
export const test = base.extend({
  page: async ({ page }, use) => {
    await page.addInitScript((keys) => {
      const factory: KeyAction[] = Array.from({ length: 132 }, () => ({ kind: "disabled" }));
      for (const key of keys) factory[key.pos.row * 22 + key.pos.col] = key.usage === null
        ? { kind: "fn" } : { kind: "key", usage: key.usage };
      const state = {
        fail: new URL(location.href).searchParams.get("fail") || "",
        hold: "", release: () => {}, calls: [] as { cmd: string; args: any }[],
        keymap: structuredClone(factory),
        led: { mode: "Static", brightness: 4, speed: 2, color: [255, 0, 0] },
        performance: { debounce: 3, report_rate_khz: 8 },
        side: { mode: "Wave", brightness: 4, speed: 3, color: [255, 0, 0], options: [0, 0, 0, 0, 1, 0] },
        keyColors: Array.from({ length: 132 }, () => [255, 255, 255]),
        triggers: Object.fromEntries(keys.map((key, i) => [`${key.pos.row}:${key.pos.col}`, {
          press: i === 1 ? 20 : 10, release: i === 1 ? 20 : 10,
          separate: false, quick_trigger: false, qt_press: 5, qt_release: 5,
        }])),
      };
      (window as any).__testDevice = state;
      // No IPC or hardware: every command stays inside this isolated browser page.
      (window as any).__TAURI_INTERNALS__ = {
        invoke: async (cmd: string, args: any = {}) => {
          state.calls.push({ cmd, args: structuredClone(args) });
          if (state.hold === cmd) await new Promise<void>((resolve) => { state.release = resolve; });
          if (state.fail === cmd) throw new Error("USB desconectado");
          switch (cmd) {
            case "layout": return keys;
            case "device_info": return { path: "/dev/hidraw-test", serial: "TEST", handshake: [] };
            case "get_keymap": return structuredClone(state.keymap);
            case "factory_keymap": return structuredClone(factory);
            case "set_keymap": state.keymap = structuredClone(args.keymap); return;
            case "get_led": return structuredClone(state.led);
            case "set_led": state.led = args.config; return structuredClone(state.led);
            case "calibrate_key": return true;
            case "get_side_light": return structuredClone(state.side);
            case "set_side_light": state.side = structuredClone(args.side); return structuredClone(state.side);
            case "get_performance": return structuredClone(state.performance);
            case "set_performance": state.performance = structuredClone(args.performance); return structuredClone(state.performance);
            case "reset_sensitivity":
              for (const key of Object.keys(state.triggers)) state.triggers[key] = { ...state.triggers[key], press: 20, release: 20 };
              return;
            case "get_key_colors": return structuredClone(state.keyColors);
            case "set_key_colors": state.keyColors = structuredClone(args.colors); return;
            case "get_key_trigger": return structuredClone(state.triggers[`${args.key.row}:${args.key.col}`]);
            case "set_trigger":
              for (const key of args.keys) state.triggers[`${key.row}:${key.col}`] = {
                ...args.settings, release: args.settings.separate ? args.settings.release : args.settings.press,
              };
              return;
            default: throw new Error(`Unexpected command: ${cmd}`);
          }
        },
      };
    }, layout);
    await use(page);
  },
});
