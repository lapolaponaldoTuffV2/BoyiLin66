import { expect, test } from "./fixtures";

const open = async (page: import("@playwright/test").Page, query = "") => {
  await page.goto(`/${query}`);
  await page.getByRole("button", { name: "Sistema", exact: true }).click();
};

test("sleep reads seconds, edits light in seconds and keyboard in minutes, and enforces the limits", async ({ page }) => {
  await open(page);
  await expect(page.getByText("Repouso lido do teclado", { exact: false })).toBeVisible();
  const light = page.getByLabel("Luz apaga após (segundos, 0–60000)");
  const keyboard = page.getByLabel("Teclado dorme após (minutos, 5–1000)");
  await expect(light).toHaveValue("60");
  await expect(keyboard).toHaveValue("30");
  await keyboard.fill("4");
  await expect(page.getByRole("alert")).toContainText("5 a 1000 minutos");
  await expect(page.getByRole("button", { name: "Aplicar repouso" })).toBeDisabled();
  await keyboard.fill("10");
  await light.fill("900");
  await expect(page.getByRole("alert")).toContainText("não pode apagar depois");
  await light.fill("300");
  await page.getByRole("button", { name: "Aplicar repouso" }).click();
  await expect(page.getByText("Repouso aplicado e conferido no teclado.")).toBeVisible();
  expect(await page.evaluate(() => (window as any).__testDevice.sleep)).toEqual({ light_s: 300, keyboard_s: 600, never: false });
});

test("never sleeping hides the timers and skips their limits", async ({ page }) => {
  await open(page);
  await page.getByRole("checkbox", { name: "Nunca dormir" }).press("Space");
  await expect(page.getByLabel("Luz apaga após (segundos, 0–60000)")).toHaveCount(0);
  await page.getByRole("button", { name: "Aplicar repouso" }).click();
  await expect(page.getByText("Repouso aplicado e conferido no teclado.")).toBeVisible();
  expect(await page.evaluate(() => (window as any).__testDevice.sleep.never)).toBe(true);
});

test("a failed read can be retried", async ({ page }) => {
  await open(page, "?fail=get_sleep");
  await expect(page.getByText("Não foi possível ler o sistema.", { exact: false })).toBeVisible();
  await page.evaluate(() => { (window as any).__testDevice.fail = ""; });
  await page.getByRole("button", { name: "Tentar novamente" }).click();
  await expect(page.getByLabel("Luz apaga após (segundos, 0–60000)")).toHaveValue("60");
});
