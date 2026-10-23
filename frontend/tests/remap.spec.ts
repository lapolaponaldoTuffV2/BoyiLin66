import type { Page } from "@playwright/test";
import { expect, test } from "./fixtures";

async function openRemap(page: Page) {
  await page.getByRole("button", { name: "Teclas", exact: true }).click();
  await expect(page.getByText("Cópia local carregada. Selecione uma tecla para editar.")).toBeVisible();
}

test.beforeEach(async ({ page }) => { await page.goto("/"); });

test("third page loads the saved action, labels its local source and marks remapped keys", async ({ page }, testInfo) => {
  await page.evaluate(() => { (window as any).__testDevice.keymap[22] = { kind: "key", usage: 4 }; });
  await openRemap(page);
  await expect(page.getByRole("navigation").getByRole("button").nth(2)).toHaveText("Teclas");
  await expect(page.getByText("O teclado não informa o próprio mapa.", { exact: false })).toBeVisible();
  const esc = page.getByRole("button", { name: "Esc", exact: true });
  await esc.press("Enter");
  await expect(page.getByRole("heading", { name: "Ação de Esc" })).toBeVisible();
  await expect(page.getByLabel("Tecla de destino", { exact: true })).toHaveValue("4");
  await expect(esc).toHaveClass(/remapped/);
  await expect(esc).toHaveAccessibleDescription("↦ A");
  await page.setViewportSize({ width: 960, height: 640 });
  expect(await page.locator(".content").evaluate((el) => el.scrollWidth <= el.clientWidth)).toBe(true);
  await page.setViewportSize({ width: 1180, height: 1100 });
  await page.locator(".content").evaluate((el) => { el.scrollTop = 0; });
  await page.screenshot({ path: testInfo.outputPath("remap.png") });
  expect(await page.evaluate(() => (window as any).__testDevice.calls.filter((c: any) => c.cmd === "set_keymap"))).toEqual([]);
});

test("key list and next-key capture edit only the draft; Escape cancels capture", async ({ page }) => {
  await openRemap(page);
  await page.getByRole("button", { name: "Esc", exact: true }).click();
  const target = page.getByLabel("Tecla de destino", { exact: true });
  await target.selectOption("224");
  await expect(page.getByRole("button", { name: "Esc", exact: true })).toHaveAccessibleDescription("↦ Ctrl esquerdo");
  await page.getByRole("button", { name: "Capturar próxima tecla" }).click();
  await page.keyboard.press("z");
  await expect(target).toHaveValue("29");
  await page.getByRole("button", { name: "Capturar próxima tecla" }).click();
  await page.keyboard.press("Escape");
  await expect(page.getByText("Captura cancelada.", { exact: true })).toBeVisible();
  await expect(target).toHaveValue("29");
  expect(await page.evaluate(() => (window as any).__testDevice.keymap[22])).toEqual({ kind: "key", usage: 41 });
});

test("shortcuts require one or two modifier bits and a non-modifier key", async ({ page }) => {
  await openRemap(page);
  await page.getByRole("button", { name: "Caps", exact: true }).click();
  await page.getByLabel("Tipo de ação").selectOption("shortcut");
  await page.getByLabel("Tecla de destino", { exact: true }).selectOption("6");
  await page.getByRole("checkbox", { name: "Ctrl esquerdo", exact: true }).uncheck();
  await expect(page.getByRole("button", { name: "Aplicar", exact: true })).toBeDisabled();
  await expect(page.getByRole("alert")).toContainText("1–2 modificadores");
  await page.getByRole("checkbox", { name: "Ctrl esquerdo", exact: true }).check();
  await page.getByRole("checkbox", { name: "Shift direito", exact: true }).check();
  await expect(page.getByRole("checkbox", { name: "Alt esquerdo", exact: true })).toBeDisabled();
  await expect(page.getByLabel("Tecla de destino", { exact: true }).locator('option[value="224"]')).toHaveCount(0);
  await page.getByRole("button", { name: "Aplicar", exact: true }).click();
  await expect(page.getByText("Mapa aplicado e cópia local salva.")).toBeVisible();
  expect(await page.evaluate(() => (window as any).__testDevice.keymap[66])).toEqual({ kind: "shortcut", usage: 6, modifiers: 33 });
});

test("Fn cannot be edited, removed or assigned to another key", async ({ page }) => {
  await openRemap(page);
  await page.getByRole("button", { name: "Fn", exact: true }).click();
  await expect(page.getByText("Fn protegida.", { exact: false })).toBeVisible();
  await expect(page.getByLabel("Tipo de ação")).toHaveCount(0);
  await page.getByRole("button", { name: "Esc", exact: true }).click();
  await expect(page.getByLabel("Tipo de ação").locator('option[value="fn"]')).toHaveCount(0);
  await page.getByLabel("Tipo de ação").selectOption("disabled");
  await page.getByRole("button", { name: "Aplicar", exact: true }).click();
  await expect(page.getByText("Mapa aplicado e cópia local salva.")).toBeVisible();
  expect(await page.evaluate(() => (window as any).__testDevice.keymap.filter((a: any) => a.kind === "fn").length)).toBe(1);
});

test("media and mouse lists match the protocol enums; only mouse is beta", async ({ page }) => {
  await openRemap(page);
  await page.getByRole("button", { name: "Caps", exact: true }).click();
  await page.getByLabel("Tipo de ação").selectOption("media");
  await expect(page.getByLabel("Ação multimídia").locator("option")).toHaveCount(15);
  await page.getByLabel("Ação multimídia").selectOption("Mute");
  await page.getByRole("button", { name: "Aplicar", exact: true }).click();
  await expect(page.getByText("Mapa aplicado e cópia local salva.")).toBeVisible();
  expect(await page.evaluate(() => (window as any).__testDevice.keymap[66])).toEqual({ kind: "media", key: "Mute" });
  await page.getByLabel("Tipo de ação").selectOption("mouse");
  await expect(page.locator(".badge")).toHaveText("beta");
  await expect(page.getByLabel("Ação de mouse").locator("option")).toHaveCount(7);
  await page.getByLabel("Ação de mouse").selectOption("ScrollDown");
  await page.getByRole("button", { name: "Aplicar", exact: true }).click();
  await expect(page.getByText("Mapa aplicado e cópia local salva.")).toBeVisible();
  expect(await page.evaluate(() => (window as any).__testDevice.keymap[66])).toEqual({ kind: "mouse", action: "ScrollDown" });
});

test("apply writes all 132 slots once and preserves unchanged and empty positions", async ({ page }) => {
  await openRemap(page);
  const before = await page.evaluate(() => structuredClone((window as any).__testDevice.keymap));
  await page.getByRole("button", { name: "Esc", exact: true }).click();
  await page.getByLabel("Tecla de destino", { exact: true }).selectOption("4");
  await page.evaluate(() => { (window as any).__testDevice.hold = "set_keymap"; });
  await page.getByRole("button", { name: "Aplicar", exact: true }).click();
  await expect(page.getByRole("button", { name: "Aplicar", exact: true })).toBeDisabled();
  await expect(page.getByRole("button", { name: "Restaurar padrão" })).toBeDisabled();
  await expect(page.getByLabel("Tipo de ação")).toBeDisabled();
  await expect(page.getByRole("button", { name: "Esc", exact: true })).toBeDisabled();
  await page.evaluate(() => (window as any).__testDevice.release());
  await expect(page.getByText("Mapa aplicado e cópia local salva.")).toBeVisible();
  const calls = await page.evaluate(() => (window as any).__testDevice.calls.filter((c: any) => c.cmd === "set_keymap"));
  expect(calls).toHaveLength(1);
  expect(calls[0].args.keymap).toHaveLength(132);
  before[22] = { kind: "key", usage: 4 };
  expect(calls[0].args.keymap).toEqual(before);
});

test("restore needs confirmation, requests factory map and writes it only after acceptance", async ({ page }) => {
  await openRemap(page);
  await page.getByRole("button", { name: "Esc", exact: true }).click();
  await page.getByLabel("Tecla de destino", { exact: true }).selectOption("4");
  page.once("dialog", async (dialog) => { expect(dialog.message()).toContain("camada base"); await dialog.dismiss(); });
  await page.getByRole("button", { name: "Restaurar padrão" }).click();
  expect(await page.evaluate(() => (window as any).__testDevice.calls.filter((c: any) => c.cmd === "set_keymap"))).toEqual([]);
  await expect(page.getByLabel("Tecla de destino", { exact: true })).toHaveValue("4");
  const start = await page.evaluate(() => (window as any).__testDevice.calls.length);
  page.once("dialog", (dialog) => dialog.accept());
  await page.getByRole("button", { name: "Restaurar padrão" }).click();
  await expect(page.getByText("Padrão restaurado e cópia local salva.")).toBeVisible();
  await expect(page.getByLabel("Tecla de destino", { exact: true })).toHaveValue("41");
  await expect(page.locator(".kb-key.remapped")).toHaveCount(0);
  expect(await page.evaluate((index) => (window as any).__testDevice.calls.slice(index).map((c: any) => c.cmd), start))
    .toEqual(["factory_keymap", "set_keymap"]);
});

test("write errors preserve the draft, warn of partial changes and permit retry", async ({ page }) => {
  await openRemap(page);
  await page.getByRole("button", { name: "Esc", exact: true }).click();
  await page.getByLabel("Tecla de destino", { exact: true }).selectOption("4");
  await page.evaluate(() => { (window as any).__testDevice.fail = "set_keymap"; });
  await page.getByRole("button", { name: "Aplicar", exact: true }).click();
  await expect(page.getByRole("alert")).toContainText("USB desconectado");
  await expect(page.getByRole("status").filter({ hasText: "Falha ao gravar." })).toContainText("cópia salva pode estar desatualizada");
  await expect(page.getByLabel("Tecla de destino", { exact: true })).toHaveValue("4");
  await expect(page.getByRole("button", { name: "Aplicar", exact: true })).toBeEnabled();
  await page.evaluate(() => { (window as any).__testDevice.fail = ""; });
  await page.getByRole("button", { name: "Aplicar", exact: true }).click();
  await expect(page.getByText("Mapa aplicado e cópia local salva.")).toBeVisible();
  await expect(page.getByRole("alert")).toHaveCount(0);
});

test("leaving an edited map requires discard confirmation", async ({ page }) => {
  await openRemap(page);
  await page.getByRole("button", { name: "Esc", exact: true }).click();
  await page.getByLabel("Tecla de destino", { exact: true }).selectOption("4");
  page.once("dialog", (dialog) => dialog.dismiss());
  await page.getByRole("button", { name: "Iluminação", exact: true }).click();
  await expect(page.getByLabel("Tecla de destino", { exact: true })).toHaveValue("4");
  page.once("dialog", (dialog) => dialog.accept());
  await page.getByRole("button", { name: "Iluminação", exact: true }).click();
  await expect(page.getByRole("radio", { name: "Estático", exact: true })).toBeChecked();
  expect(await page.evaluate(() => (window as any).__testDevice.calls.filter((c: any) => c.cmd === "set_keymap"))).toEqual([]);
});

test("leaving while factory data is pending cancels restore before any write", async ({ page }) => {
  await openRemap(page);
  await page.evaluate(() => { (window as any).__testDevice.hold = "factory_keymap"; });
  page.once("dialog", (dialog) => dialog.accept());
  await page.getByRole("button", { name: "Restaurar padrão" }).click();
  await expect(page.getByText("Restaurando padrão…", { exact: true })).toBeVisible();
  await page.getByRole("button", { name: "Iluminação", exact: true }).click();
  await page.evaluate(() => (window as any).__testDevice.release());
  await expect(page.getByRole("radio", { name: "Estático", exact: true })).toBeChecked();
  expect(await page.evaluate(() => (window as any).__testDevice.calls.filter((c: any) => c.cmd === "set_keymap"))).toEqual([]);
});

for (const invalid of ["duplicate Fn", "missing Fn", "Fn in empty slot", "short map", "invalid media"]) {
  test(`invalid local copy is blocked and can be restored: ${invalid}`, async ({ page }) => {
    await page.evaluate((kind) => {
      const map = (window as any).__testDevice.keymap;
      if (kind === "duplicate Fn") map[22] = { kind: "fn" };
      if (kind === "missing Fn" || kind === "Fn in empty slot") map[122] = { kind: "disabled" };
      if (kind === "Fn in empty slot") map[0] = { kind: "fn" };
      if (kind === "short map") map.pop();
      if (kind === "invalid media") map[22] = { kind: "media", key: "toString" };
    }, invalid);
    await page.getByRole("button", { name: "Teclas", exact: true }).click();
    await expect(page.getByRole("alert")).toBeVisible();
    await expect(page.getByRole("button", { name: "Aplicar", exact: true })).toBeDisabled();
    await expect(page.getByRole("button", { name: "Tentar novamente", exact: true })).toBeVisible();
    page.once("dialog", (dialog) => dialog.accept());
    await page.getByRole("button", { name: "Restaurar padrão" }).click();
    await expect(page.getByText("Padrão restaurado e cópia local salva.")).toBeVisible();
    await expect(page.getByRole("alert")).toHaveCount(0);
  });
}
