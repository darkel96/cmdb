import { expect, test, type Page } from "@playwright/test";

async function login(page: Page) {
  await page.goto("/login");
  await page.getByLabel("Benutzername").fill("admin");
  await page.getByLabel("Passwort").fill("test");
  await page.getByRole("button", { name: "Anmelden" }).click();
  await expect(page.getByRole("heading", { name: "Kundenübersicht" })).toBeVisible();
}

const width = async (page: Page, label: string) =>
  (await page.getByRole("columnheader", { name: label, exact: true }).first().boundingBox())!.width;

test("Spaltenbreite ziehen, gemerkt nach dem Neuladen, zurücksetzen", async ({ page }) => {
  await login(page);
  await page.goto("/bereich/server");
  await page.evaluate(() => localStorage.removeItem("cmdb-spalten:Übersicht Server"));
  await page.reload();
  const handle = page.getByRole("separator", { name: "Breite der Spalte Lieferant" });
  const before = await width(page, "Lieferant");
  await handle.scrollIntoViewIfNeeded();
  const box = (await handle.boundingBox())!;
  await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
  await page.mouse.down();
  await page.mouse.move(box.x + 120, box.y + box.height / 2, { steps: 5 });
  await page.mouse.up();
  const after = await width(page, "Lieferant");
  expect(after).toBeGreaterThan(before + 80);

  // Klick auf den Griff sortiert nicht
  await expect(page.getByRole("columnheader", { name: "Lieferant", exact: true }).first()).not.toHaveAttribute("aria-sort", /.+/);

  await page.reload();
  expect(Math.abs((await width(page, "Lieferant")) - after)).toBeLessThan(3);

  await page.getByRole("button", { name: "Spaltenbreiten zurücksetzen" }).click();
  expect(Math.abs((await width(page, "Lieferant")) - before)).toBeLessThan(3);
  await expect(page.getByRole("button", { name: "Spaltenbreiten zurücksetzen" })).toHaveCount(0);
});

test("Doppelklick passt die Spalte an den längsten Inhalt an, Pfeiltasten ändern in Schritten", async ({ page }) => {
  await login(page);
  await page.goto("/bereich/server");
  await page.evaluate(() => localStorage.removeItem("cmdb-spalten:Übersicht Server"));
  await page.reload();
  const handle = page.getByRole("separator", { name: "Breite der Spalte Modell" });
  // Erst sehr schmal ziehen, dann Doppelklick: wieder breit genug für den Inhalt
  await handle.scrollIntoViewIfNeeded();
  const box = (await handle.boundingBox())!;
  await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
  await page.mouse.down();
  await page.mouse.move(box.x - 300, box.y + box.height / 2, { steps: 5 });
  await page.mouse.up();
  expect(await width(page, "Modell")).toBeLessThan(60);
  await handle.scrollIntoViewIfNeeded();
  await handle.dblclick();
  const fitted = await width(page, "Modell");
  expect(fitted).toBeGreaterThan(80);
  // Der Inhalt passt: keine abgeschnittene Zelle in der Spalte
  const clipped = await page.locator("tbody tr td:nth-child(7)").evaluateAll((cells) => cells.filter((td) => td.scrollWidth > td.clientWidth + 1).length);
  expect(clipped).toBe(0);

  await handle.focus();
  await page.keyboard.press("ArrowRight");
  expect(Math.round((await width(page, "Modell")) - fitted)).toBe(16);
  await page.getByRole("button", { name: "Spaltenbreiten zurücksetzen" }).click();
});
