import { expect, test, type Page } from "@playwright/test";

async function openServers(page: Page) {
  await page.goto("/login");
  await page.getByLabel("Benutzername").fill("user");
  await page.getByLabel("Passwort").fill("test");
  await page.getByRole("button", { name: "Anmelden" }).click();
  await expect(page.getByRole("heading", { name: "Kundenübersicht" })).toBeVisible();
  const toggle = page.getByRole("button", { name: "Menü ein- oder ausblenden" });
  if ((await toggle.isVisible()) && (await toggle.getAttribute("aria-expanded")) === "false") await toggle.click();
  const nav = page.getByRole("navigation", { name: "Hauptnavigation" }).locator("visible=true");
  await nav.getByRole("button", { name: "Hardware" }).click();
  await nav.getByRole("link", { name: "Server" }).click();
  await expect(page.getByRole("heading", { name: "Übersicht Server" })).toBeVisible();
}

test("Übersicht Server: Spalten wie in GAPTEQ, Öffnen der markierten Zeile", async ({ page }) => {
  await openServers(page);
  const table = page.getByRole("region", { name: "Übersicht Server" });
  for (const label of ["ID", "Firma", "Lieferant", "Lieferdatum", "Bestellnummer", "Hersteller", "Modell", "Servertyp", "Servicetag", "Wartungstyp", "Support bis", "EOL", "Besonderheiten"]) {
    await expect(table.getByRole("columnheader", { name: label, exact: true })).toHaveCount(1);
  }
  await expect(page.getByTestId("table-status")).toHaveText("Seite 1 von 1 (24 Elemente)");

  const open = page.getByRole("button", { name: "Öffnen" });
  await expect(open).toBeDisabled();
  await table.locator("tbody tr").nth(1).click();
  await expect(open).toBeEnabled();
  await open.click();
  await expect(page.getByRole("heading", { name: /^Server 10001/ })).toBeVisible();
  await expect(page.getByText("Nur lesend.")).toBeVisible();

  await page.getByRole("link", { name: "Zurück zur Übersicht" }).click();
  await expect(page.getByRole("heading", { name: "Übersicht Server" })).toBeVisible();
});

test("Übersicht Server: Doppelklick öffnet, Datum sortiert chronologisch", async ({ page }) => {
  await openServers(page);
  const table = page.getByRole("region", { name: "Übersicht Server" });
  await table.getByRole("button", { name: "Support bis" }).click();
  const dates = await table.locator("tbody tr td:nth-child(11)").allTextContents();
  const iso = dates.map((d) => { const [dd, mm, yy] = d.split("."); return `20${yy}-${mm}-${dd}`; });
  expect(iso).toEqual([...iso].sort());

  await table.locator("tbody tr").first().dblclick();
  await expect(page.getByRole("heading", { name: /^Server \d+/ })).toBeVisible();
});
