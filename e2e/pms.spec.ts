import { expect, test, type Page } from "@playwright/test";

async function login(page: Page) {
  await page.goto("/login");
  await page.getByLabel("Benutzername").fill("user");
  await page.getByLabel("Passwort").fill("test");
  await page.getByRole("button", { name: "Anmelden" }).click();
  await expect(page.getByRole("heading", { name: "Kundenübersicht" })).toBeVisible();
}

type Pms = { items: { contractId: number; module: string; listPrice: number }[]; prices: { module: string }[] };
const euro = (v: number) => new Intl.NumberFormat("de-DE", { style: "currency", currency: "EUR" }).format(v);

test("PMS-Module: Übersicht mit Preisliste, öffnet den Oracle-ESL-Vertrag mit Modulen, Summe und Oracle-Systemen", async ({ page }) => {
  await login(page);
  const pms = (await (await page.request.get("/api/pms-module")).json()) as Pms;
  const contractId = pms.items[0].contractId;
  const modules = pms.items.filter((m) => m.contractId === contractId);

  await page.goto("/bereich/pms-module");
  await expect(page.getByRole("region", { name: "Preisliste" })).toContainText(pms.prices[0].module);
  await expect(page.getByRole("region", { name: "Summen" })).toContainText(`Summe aller ${pms.items.length} Module`);
  const t = page.getByRole("region", { name: "Übersicht PMS-Module" });
  await expect(t.locator("tbody tr")).toHaveCount(Math.min(pms.items.length, 20));

  // Markieren und „Öffnen“ (Doppelklick gibt es auf dem Handy nicht)
  await t.locator("tbody tr").first().locator("td").first().click();
  await t.getByRole("button", { name: "Öffnen" }).click();
  await expect(page).toHaveURL(new RegExp(`/bereich/oracle-esl/${contractId}$`));

  const panel = page.getByRole("region", { name: "PMS-Module" });
  for (const m of modules) await expect(panel).toContainText(m.module);
  await expect(panel.locator("tfoot")).toContainText(euro(modules.reduce((s, m) => s + m.listPrice, 0)));

  // Oracle-Systeme desselben Kunden, Link führt hin und wieder zurück
  const oracle = page.getByRole("region", { name: "Oracle-Inventarisierungen" });
  const link = oracle.getByRole("link").first();
  const oracleId = (await link.textContent())!.trim();
  await link.click();
  await expect(page).toHaveURL(new RegExp(`/bereich/oracle/${oracleId}$`));
  await page.getByRole("link", { name: `Zurück zu Oracle-ESL ${contractId}` }).click();
  await expect(page).toHaveURL(new RegExp(`/bereich/oracle-esl/${contractId}$`));

  await page.getByRole("link", { name: "Zurück zur Übersicht Oracle-ESL" }).click();
  await expect(page).toHaveURL(/\/bereich\/oracle-esl$/);
});

test("PMS-Module nur angemeldet", async ({ page }) => {
  expect((await page.request.get("/api/pms-module")).status()).toBe(401);
});
