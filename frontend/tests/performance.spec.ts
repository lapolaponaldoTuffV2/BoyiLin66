import { expect, test } from "./fixtures";

const open = async (page: import("@playwright/test").Page, query = "") => {
  await page.goto(`/${query}`);
  await page.getByRole("button", { name: "Acionamento", exact: true }).click();
};

test("performance shows the keyboard's debounce and report rate and writes both", async ({ page }) => {
  await open(page);
  await expect(page.getByText("Desempenho lido do teclado.")).toBeVisible();
  await expect(page.getByLabel("Anti-repique (debounce)")).toHaveValue("3");
  await expect(page.getByLabel("Taxa de relatório")).toHaveValue("8");
  await expect(page.getByLabel("Desempenho do teclado").locator(".badge")).toHaveCount(0);
  await page.getByLabel("Anti-repique (debounce)").selectOption("5");
  await page.getByLabel("Taxa de relatório").selectOption("1");
  await page.getByRole("button", { name: "Aplicar desempenho" }).click();
  await expect(page.getByText("Desempenho aplicado e conferido no teclado.")).toBeVisible();
  expect(await page.evaluate(() => (window as any).__testDevice.performance)).toEqual({ debounce: 5, report_rate_khz: 1 });
});

test("a failed performance read does not block the trigger page and can be retried", async ({ page }) => {
  await open(page, "?fail=get_performance");
  await expect(page.getByText("Não foi possível ler o desempenho.")).toBeVisible();
  await expect(page.getByText("Acionamento lido do teclado.")).toBeVisible();
  await expect(page.getByRole("button", { name: "Aplicar desempenho" })).toBeDisabled();
  await page.evaluate(() => { (window as any).__testDevice.fail = ""; });
  await page.getByRole("button", { name: "Tentar novamente" }).click();
  await expect(page.getByLabel("Taxa de relatório")).toHaveValue("8");
});

test("factory sensitivity reset asks first, then rereads every key", async ({ page }) => {
  await open(page);
  await expect(page.getByText("Acionamento lido do teclado.")).toBeVisible();
  page.once("dialog", (dialog) => dialog.dismiss());
  await page.getByRole("button", { name: "Restaurar sensibilidade de fábrica" }).click();
  expect(await page.evaluate(() => (window as any).__testDevice.calls.map((c: any) => c.cmd))).not.toContain("reset_sensitivity");
  page.once("dialog", (dialog) => dialog.accept());
  await page.getByRole("button", { name: "Restaurar sensibilidade de fábrica" }).click();
  await expect(page.getByText("Acionamento lido do teclado.")).toBeVisible();
  await page.getByRole("button", { name: "Esc", exact: true }).click();
  await expect(page.getByLabel("Ponto de acionamento")).toHaveValue("20");
});
