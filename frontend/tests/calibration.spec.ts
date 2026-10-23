import { expect, test } from "./fixtures";

test("calibration walks the selected keys one at a time and reports failures", async ({ page }) => {
  await page.goto("/");
  await page.getByRole("button", { name: "Acionamento", exact: true }).click();
  const calibrate = page.getByRole("button", { name: "Calibrar", exact: true });
  await expect(calibrate).toBeDisabled();
  await page.getByRole("button", { name: "Caps", exact: true }).click();
  await page.getByRole("button", { name: "Esc", exact: true }).click({ modifiers: ["Shift"] });
  await page.evaluate(() => { (window as any).__testDevice.hold = "calibrate_key"; });
  await calibrate.click();
  await expect(page.getByText("(1 de 2): aperte a tecla até o fundo e solte.", { exact: false })).toBeVisible();
  await expect(calibrate).toBeDisabled();
  await page.evaluate(() => { const d = (window as any).__testDevice; d.hold = ""; d.release(); });
  await expect(page.getByText("Calibração concluída.")).toBeVisible();
  const keys = await page.evaluate(() => (window as any).__testDevice.calls
    .filter((c: any) => c.cmd === "calibrate_key").map((c: any) => c.args.key));
  expect(keys).toEqual([{ row: 1, col: 0 }, { row: 3, col: 0 }]);
});

test("a calibration timeout stops the run and is reported", async ({ page }) => {
  await page.goto("/?fail=calibrate_key");
  await page.getByRole("button", { name: "Acionamento", exact: true }).click();
  await page.getByRole("button", { name: "Caps", exact: true }).click();
  await page.getByRole("button", { name: "Calibrar", exact: true }).click();
  await expect(page.getByText("Calibração interrompida", { exact: false })).toBeVisible();
  await expect(page.getByRole("alert")).toContainText("USB desconectado");
});
