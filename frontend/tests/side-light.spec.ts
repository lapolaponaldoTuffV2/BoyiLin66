import { expect, test } from "./fixtures";

test("side light reads the keyboard, is marked beta and writes options back unchanged", async ({ page }) => {
  await page.goto("/");
  await expect(page.getByText("Luz lateral lida do teclado.")).toBeVisible();
  const panel = page.getByRole("group", { name: "Luz lateral" });
  await expect(panel.locator(".badge")).toHaveText("beta");
  await expect(panel.getByLabel("Efeito")).toHaveValue("Wave");
  await expect(panel.getByLabel("Efeito").locator("option")).toHaveCount(6);
  await panel.getByLabel("Efeito").selectOption("Neon");
  await page.getByLabel("Cor da luz lateral").fill("#00ff00");
  await page.getByRole("button", { name: "Aplicar luz lateral" }).click();
  await expect(page.getByText("Luz lateral aplicada e conferida no teclado.")).toBeVisible();
  expect(await page.evaluate(() => (window as any).__testDevice.side)).toEqual({
    mode: "Neon", brightness: 4, speed: 3, color: [0, 255, 0], options: [0, 0, 0, 0, 1, 0],
  });
  // The backlight apply is a separate action.
  expect(await page.evaluate(() => (window as any).__testDevice.calls.map((c: any) => c.cmd))).not.toContain("set_led");
});

test("turning the side light off hides colour and speed", async ({ page }) => {
  await page.goto("/");
  const panel = page.getByRole("group", { name: "Luz lateral" });
  await panel.getByLabel("Efeito").selectOption("Off");
  await expect(page.getByLabel("Cor da luz lateral")).toHaveCount(0);
  await expect(page.getByLabel("Velocidade da luz lateral")).toHaveCount(0);
});

test("a failed side light read leaves the backlight usable", async ({ page }) => {
  await page.goto("/?fail=get_side_light");
  await expect(page.getByText("Não foi possível ler a luz lateral.")).toBeVisible();
  await expect(page.getByText("Iluminação lida do teclado.")).toBeVisible();
  await expect(page.getByRole("button", { name: "Aplicar luz lateral" })).toBeDisabled();
});
