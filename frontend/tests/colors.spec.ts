import { expect, test } from "./fixtures";

const calls = (page: import("@playwright/test").Page) =>
  page.evaluate(() => (window as any).__testDevice.calls.map((c: any) => c.cmd));

test("Custom effect paints selected keys and writes the colours before the effect", async ({ page }, testInfo) => {
  await page.goto("/");
  await expect(page.getByText("Iluminação lida do teclado.")).toBeVisible();
  await page.getByRole("radio", { name: "Personalizado", exact: true }).check();
  await expect(page.getByRole("heading", { name: "Cores por tecla" })).toBeVisible();
  await expect(page.getByLabel("Cor", { exact: true })).toHaveCount(0);
  const paint = page.getByLabel("Cor das teclas selecionadas");
  await expect(paint).toBeDisabled();
  await page.getByRole("button", { name: "Esc", exact: true }).click();
  await page.getByRole("button", { name: "A", exact: true }).click({ modifiers: ["Shift"] });
  await paint.fill("#ff0000");
  await page.getByRole("button", { name: "Limpar", exact: true }).click();
  await page.getByRole("button", { name: "Caps", exact: true }).click();
  await paint.fill("#0000ff");
  await page.setViewportSize({ width: 960, height: 640 });
  expect(await page.locator(".content").evaluate((el) => el.scrollWidth <= el.clientWidth)).toBe(true);
  await page.setViewportSize({ width: 1180, height: 1100 });
  await page.screenshot({ path: testInfo.outputPath("colors.png") });

  const start = (await calls(page)).length;
  await page.getByRole("button", { name: "Aplicar", exact: true }).click();
  await expect(page.getByText("Iluminação aplicada.")).toBeVisible();
  expect((await calls(page)).slice(start)).toEqual(["set_key_colors", "set_led"]);
  const device = await page.evaluate(() => (window as any).__testDevice);
  expect(device.led.mode).toBe("Custom");
  // Esc is slot 22, A slot 68, Caps slot 66; everything else stays white.
  expect(device.keyColors[22]).toEqual([255, 0, 0]);
  expect(device.keyColors[68]).toEqual([255, 0, 0]);
  expect(device.keyColors[66]).toEqual([0, 0, 255]);
  expect(device.keyColors.filter((rgb: number[]) => rgb.join() === "255,255,255")).toHaveLength(129);

  // Selecting one key shows its colour in the picker.
  await page.getByRole("button", { name: "Esc", exact: true }).click();
  await expect(paint).toHaveValue("#ff0000");
});

test("other effects never write per-key colours", async ({ page }) => {
  await page.goto("/");
  await expect(page.getByText("Iluminação lida do teclado.")).toBeVisible();
  await page.getByRole("radio", { name: "Respiração", exact: true }).check();
  await expect(page.getByRole("heading", { name: "Pré-visualização" })).toBeVisible();
  await page.getByRole("button", { name: "Aplicar", exact: true }).click();
  await expect(page.getByText("Iluminação aplicada.")).toBeVisible();
  expect(await calls(page)).not.toContain("set_key_colors");
});

test("an invalid local colour copy falls back to white without blocking the page", async ({ page }) => {
  await page.goto("/?fail=get_key_colors");
  await expect(page.getByText("A cópia local das cores por tecla é inválida; usando branco.", { exact: false })).toBeVisible();
  await expect(page.getByRole("alert")).toHaveCount(0);
  await page.getByRole("radio", { name: "Personalizado", exact: true }).check();
  await page.getByRole("button", { name: "Esc", exact: true }).click();
  await expect(page.getByLabel("Cor das teclas selecionadas")).toHaveValue("#ffffff");
});
