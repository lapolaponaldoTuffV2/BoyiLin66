import { readFileSync } from "node:fs";
import { expect, test } from "@playwright/test";

// Reuse our clean-room layout, including the rightmost and bottom keys.
const layout = [...readFileSync(new URL("../../crates/boyi-protocol/src/layout.rs", import.meta.url), "utf8")
  .matchAll(/k\((\d+), (\d+), ("(?:\\.|[^"\\])*"), (?:0x[0-9a-f]+|0), ([\d.]+), ([\d.]+)\)/g)]
  .map(([, row, col, label, x, w]) => ({
    pos: { row: Number(row), col: Number(col) }, label: JSON.parse(label),
    x: Number(x), y: Number(row) - 1, w: Number(w),
  }));
expect(layout).toHaveLength(66);

test.beforeEach(async ({ page }) => {
  await page.addInitScript((keys) => {
    const state = {
      fail: new URL(location.href).searchParams.get("fail") || "",
      hold: "", release: () => {}, calls: [] as { cmd: string; args: any }[],
      led: { mode: "Static", brightness: 4, speed: 2, color: [255, 0, 0] },
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
          case "get_led": return structuredClone(state.led);
          case "set_led": state.led = args.config; return structuredClone(state.led);
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
});

test("lighting fits the minimum window and supports keyboard navigation without writes", async ({ page }, testInfo) => {
  await page.setViewportSize({ width: 960, height: 640 });
  await page.goto("/");
  const first = page.getByRole("radio", { name: "Estático", exact: true });
  await expect(first).toBeChecked();
  await first.focus();
  await page.keyboard.press("ArrowRight");
  await expect(page.getByRole("radio", { name: "Respiração" })).toBeChecked();
  await page.keyboard.press("Tab");
  await expect(page.getByRole("button", { name: "Aplicar", exact: true })).toBeFocused();
  const brightness = page.getByRole("slider", { name: "Brilho", exact: true });
  await brightness.focus();
  await page.keyboard.press("Home");
  await expect(brightness).toHaveValue("0");
  await page.keyboard.press("End");
  await expect(brightness).toHaveValue("4");
  expect(await page.locator(".keyboard").evaluate((el) => {
    const bounds = el.getBoundingClientRect();
    return [...el.children].every((key) => {
      const rect = key.getBoundingClientRect();
      return rect.left >= bounds.left && rect.right <= bounds.right && rect.bottom <= bounds.bottom;
    });
  })).toBe(true);
  expect(await page.locator(".content").evaluate((el) => el.scrollWidth <= el.clientWidth)).toBe(true);
  await expect(page.getByRole("radio", { name: "Ritmo musical" })).toHaveCount(0);
  expect(await page.evaluate(() => (window as any).__testDevice.calls.some((c: any) => c.cmd.startsWith("set_")))).toBe(false);
  await page.setViewportSize({ width: 1180, height: 1000 });
  await page.locator(".content").evaluate((el) => { el.scrollTop = 0; });
  await page.screenshot({ path: testInfo.outputPath("lighting.png") });
});

test("lighting retries reads and prevents edits and duplicate saves while pending", async ({ page }) => {
  await page.goto("/");
  await expect(page.getByRole("radio", { name: "Estático", exact: true })).toBeChecked();
  await page.evaluate(() => { (window as any).__testDevice.fail = "get_led"; });
  await page.getByRole("button", { name: "Ler iluminação do teclado" }).click();
  await expect(page.getByText("Não foi possível ler a iluminação. Tente novamente.")).toBeVisible();
  await expect(page.getByRole("button", { name: "Aplicar", exact: true })).toBeDisabled();
  await page.evaluate(() => { (window as any).__testDevice.fail = ""; });
  await page.getByRole("button", { name: "Ler iluminação do teclado" }).click();
  await expect(page.getByRole("button", { name: "Aplicar", exact: true })).toBeEnabled();
  await expect(page.getByRole("alert")).toHaveCount(0);
  await page.evaluate(() => { (window as any).__testDevice.hold = "set_led"; });
  await page.getByRole("button", { name: "Aplicar", exact: true }).click();
  await expect(page.getByRole("slider", { name: "Brilho", exact: true })).toBeDisabled();
  await expect(page.getByRole("radio", { name: "Estático", exact: true })).toBeDisabled();
  await expect(page.getByRole("button", { name: "Ler iluminação do teclado" })).toBeDisabled();
  await expect(page.getByRole("button", { name: "Aplicar", exact: true })).toBeDisabled();
  await page.evaluate(() => (window as any).__testDevice.release());
  await expect(page.getByText("Iluminação aplicada.")).toBeVisible();
  expect(await page.evaluate(() => (window as any).__testDevice.calls.filter((c: any) => c.cmd === "set_led").length)).toBe(1);
  await page.evaluate(() => {
    const state = (window as any).__testDevice;
    state.hold = "";
    state.fail = "set_led";
  });
  await page.getByRole("button", { name: "Aplicar", exact: true }).click();
  await expect(page.getByText("Não foi possível aplicar a iluminação. Tente novamente.")).toBeVisible();
  await expect(page.getByRole("slider", { name: "Brilho", exact: true })).toBeEnabled();
});

test("initial lighting failure recovers and unsupported current modes cannot be applied", async ({ page }) => {
  await page.goto("/?fail=get_led");
  await expect(page.getByRole("button", { name: "Tentar novamente", exact: true })).toBeVisible();
  await page.evaluate(() => {
    const state = (window as any).__testDevice;
    state.fail = "";
    state.led.mode = "MusicRhythm";
  });
  await page.getByRole("button", { name: "Tentar novamente", exact: true }).click();
  await expect(page.getByRole("button", { name: "Aplicar", exact: true })).toBeDisabled();
  await page.getByRole("radio", { name: "Estático", exact: true }).check();
  await expect(page.getByRole("button", { name: "Aplicar", exact: true })).toBeEnabled();
});

test("trigger selection keeps the remaining key values and supports keyboard editing", async ({ page }, testInfo) => {
  await page.goto("/");
  await page.getByRole("button", { name: "Acionamento", exact: true }).click();
  await expect(page.getByText("Acionamento lido do teclado.")).toBeVisible();
  const esc = page.getByRole("button", { name: "Esc", exact: true });
  const one = page.getByRole("button", { name: "1", exact: true });
  const press = page.getByRole("slider", { name: "Ponto de acionamento", exact: true });
  await expect(press).toBeDisabled();
  await esc.focus();
  await page.keyboard.press("Space");
  await expect(esc).toHaveAttribute("aria-pressed", "true");
  await expect(press).toHaveValue("10");
  await one.focus();
  await page.keyboard.press("Shift+Enter");
  await expect(one).toHaveAttribute("aria-pressed", "true");
  await esc.click({ modifiers: ["Control"] });
  await expect(press).toHaveValue("20");
  await expect(press).toHaveAttribute("aria-valuetext", "2,0 mm");
  await page.getByRole("checkbox", { name: "Soltura separada", exact: true }).press("Space");
  await expect(page.getByRole("slider", { name: "Ponto de soltura", exact: true })).toBeVisible();
  await page.getByRole("checkbox", { name: "Quick Trigger", exact: true }).press("Space");
  await expect(page.getByRole("slider", { name: "Sensibilidade ao pressionar", exact: true })).toBeVisible();
  await page.getByRole("button", { name: "Selecionar todas" }).click();
  await expect(page.locator('.kb-key[aria-pressed="true"]')).toHaveCount(66);
  await page.setViewportSize({ width: 1180, height: 1000 });
  await page.screenshot({ path: testInfo.outputPath("trigger.png") });
  await page.getByRole("button", { name: "Limpar", exact: true }).click();
  await expect(page.getByRole("button", { name: "Aplicar", exact: true })).toBeDisabled();
});

test("trigger read failures disable stale settings; apply targets only the selected key", async ({ page }) => {
  await page.goto("/");
  await page.evaluate(() => { (window as any).__testDevice.fail = "get_key_trigger"; });
  await page.getByRole("button", { name: "Acionamento", exact: true }).click();
  await expect(page.getByText("Não foi possível ler o acionamento. Tente novamente.")).toBeVisible();
  await expect(page.getByRole("button", { name: "Esc", exact: true })).toBeDisabled();
  await page.evaluate(() => { (window as any).__testDevice.fail = ""; });
  await page.getByRole("button", { name: "Ler acionamento do teclado" }).click();
  await expect(page.getByText("Acionamento lido do teclado.")).toBeVisible();
  await page.getByRole("button", { name: "Esc", exact: true }).click();
  const press = page.getByRole("slider", { name: "Ponto de acionamento", exact: true });
  await press.focus();
  await page.keyboard.press("End");
  await page.evaluate(() => { (window as any).__testDevice.fail = "set_trigger"; });
  await page.getByRole("button", { name: "Aplicar", exact: true }).click();
  await expect(page.getByText("Não foi possível aplicar o acionamento. Tente novamente.")).toBeVisible();
  await expect(press).toBeEnabled();
  await expect(press).toHaveValue("40");
  await page.evaluate(() => { (window as any).__testDevice.fail = ""; });
  await page.evaluate(() => { (window as any).__testDevice.hold = "set_trigger"; });
  await page.getByRole("button", { name: "Aplicar", exact: true }).click();
  await expect(press).toBeDisabled();
  await expect(page.getByRole("button", { name: "Esc", exact: true })).toBeDisabled();
  await page.evaluate(() => (window as any).__testDevice.release());
  await expect(press).toBeEnabled();
  await expect(press).toHaveValue("40");
  await expect(page.getByRole("alert")).toHaveCount(0);
  const writes = await page.evaluate(() => (window as any).__testDevice.calls.filter((c: any) => c.cmd === "set_trigger"));
  expect(writes).toHaveLength(2);
  for (const write of writes) expect(write).toMatchObject({ args: { keys: [{ row: 1, col: 0 }], settings: { press: 40 } } });
});

test("connection and layout failures recover through reconnect", async ({ page }) => {
  await page.goto("/?fail=layout");
  await expect(page.getByRole("alert")).toContainText("USB desconectado");
  await expect(page.getByText("Conecte o BOYI 66 Pro", { exact: false })).toBeVisible();
  await page.evaluate(() => { (window as any).__testDevice.fail = ""; });
  await page.getByRole("button", { name: "Reconectar", exact: true }).click();
  await expect(page.getByRole("radio", { name: "Estático", exact: true })).toBeChecked();
  await page.evaluate(() => { (window as any).__testDevice.fail = "device_info"; });
  await page.getByRole("button", { name: "Reconectar", exact: true }).click();
  await expect(page.getByRole("button", { name: "Desconectado · tentar de novo" })).toBeVisible();
  await page.evaluate(() => { (window as any).__testDevice.fail = ""; });
  await page.getByRole("button", { name: "Desconectado · tentar de novo" }).click();
  await expect(page.getByRole("radio", { name: "Estático", exact: true })).toBeChecked();
});

test("leaving trigger cancels the remaining per-key reads", async ({ page }) => {
  await page.goto("/");
  await expect(page.getByRole("radio", { name: "Estático", exact: true })).toBeChecked();
  await page.evaluate(() => { (window as any).__testDevice.hold = "get_key_trigger"; });
  await page.getByRole("button", { name: "Acionamento", exact: true }).click();
  await expect(page.getByText("Lendo acionamento…", { exact: true })).toBeVisible();
  await page.getByRole("button", { name: "Iluminação", exact: true }).click();
  const count = await page.evaluate(() => (window as any).__testDevice.calls.filter((c: any) => c.cmd === "get_key_trigger").length);
  await page.evaluate(() => {
    const state = (window as any).__testDevice;
    state.hold = "";
    state.release();
  });
  await expect(page.getByRole("radio", { name: "Estático", exact: true })).toBeChecked();
  expect(await page.evaluate(() => (window as any).__testDevice.calls.filter((c: any) => c.cmd === "get_key_trigger").length)).toBe(count);
});
