import { expect, test, type Page } from "@playwright/test";

async function login(page: Page) {
  await page.goto("/login");
  await page.getByLabel("Benutzername").fill("admin");
  await page.getByLabel("Passwort").fill("test");
  await page.getByRole("button", { name: "Anmelden" }).click();
  await expect(page.getByRole("heading", { name: "Kundenübersicht" })).toBeVisible();
}

test("Spaltenfilter: Werte mit Anzahl auswählen (mehrere), folgt anderen Filtern, nicht bei ID", async ({ page }) => {
  await login(page);
  await page.goto("/bereich/server");
  const table = page.getByRole("region", { name: "Übersicht Server" });
  const status = table.getByTestId("table-status");
  await expect(status).toContainText("Elemente");
  const total = Number((await status.textContent())!.match(/\((\d+) Elemente\)/)![1]);

  // Viele verschiedene Werte (ID): nur Freitext
  await expect(table.getByRole("button", { name: "Werte ID auswählen" })).toHaveCount(0);

  await table.getByRole("button", { name: "Werte Servertyp auswählen" }).click();
  const list = page.getByRole("listbox", { name: "Werte Servertyp" });
  const options = list.getByRole("option");
  await expect(options.first()).toBeVisible();
  const entries = await options.evaluateAll((els) => els.map((e) => ({ text: e.querySelector("span.flex-1")?.textContent ?? "", n: Number(e.querySelector("span.tabular-nums")?.textContent) })));
  expect(entries.reduce((a, e) => a + e.n, 0)).toBe(total);

  await options.nth(0).click();
  await options.nth(1).click();
  await page.getByRole("button", { name: "Fertig" }).click();
  await expect(table.getByRole("button", { name: "Werte Servertyp auswählen" })).toContainText("2");
  await expect(status).toContainText(`(${entries[0].n + entries[1].n} Elemente)`);
  const col = (await table.locator("thead tr").first().locator("th").allTextContents()).findIndex((h) => h.trim().startsWith("Servertyp"));
  for (const v of await table.locator(`tbody td:nth-child(${col + 1})`).allTextContents()) expect([entries[0].text, entries[1].text]).toContain(v.trim());

  // Werteliste einer anderen Spalte folgt dem Filter: Summe = gefilterte Zeilen
  await table.getByRole("button", { name: "Werte Hersteller auswählen" }).click();
  const other = await page.getByRole("listbox", { name: "Werte Hersteller" }).getByRole("option").evaluateAll((els) => els.map((e) => Number(e.querySelector("span.tabular-nums")?.textContent)));
  expect(other.reduce((a, b) => a + b, 0)).toBe(entries[0].n + entries[1].n);
  await page.keyboard.press("Escape");

  await table.getByRole("button", { name: "Werte Servertyp auswählen" }).click();
  await page.getByRole("button", { name: "Auswahl aufheben" }).click();
  await page.getByRole("button", { name: "Fertig" }).click();
  await expect(status).toContainText(`(${total} Elemente)`);
});
