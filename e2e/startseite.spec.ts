import { expect, test, type Page } from "@playwright/test";

async function login(page: Page) {
  await page.goto("/login");
  await page.getByLabel("Benutzername").fill("user");
  await page.getByLabel("Passwort").fill("test");
  await page.getByRole("button", { name: "Anmelden" }).click();
  await expect(page.getByRole("heading", { name: "Kundenübersicht" })).toBeVisible();
}

async function openMenu(page: Page) {
  // Nur auf schmalen Bildschirmen gibt es den Menü-Knopf, breit ist die Seitenleiste immer da
  const toggle = page.getByRole("button", { name: "Menü ein- oder ausblenden" });
  if ((await toggle.isVisible()) && (await toggle.getAttribute("aria-expanded")) === "false") await toggle.click();
}

test("Kundenübersicht: Suche, Spaltenfilter, Seitengrösse und Blättern", async ({ page }) => {
  await login(page);
  const status = page.getByTestId("table-status");
  const rows = page.getByRole("region", { name: "Kundenübersicht" }).locator("tbody tr");
  await expect(status).toHaveText("Seite 1 von 2 (42 Elemente)");
  await expect(rows).toHaveCount(30);

  await page.getByRole("button", { name: "Nächste Seite" }).click();
  await expect(status).toHaveText("Seite 2 von 2 (42 Elemente)");
  await expect(rows).toHaveCount(12);

  await page.getByRole("button", { name: "100", exact: true }).click();
  await expect(status).toHaveText("Seite 1 von 1 (42 Elemente)");

  await page.getByLabel("Suchen").fill("muster");
  await expect(status).toHaveText("Seite 1 von 1 (6 Elemente)");
  // X im Feld leert die Suche, der Fokus bleibt im Feld; ohne Inhalt kein X
  await page.getByRole("button", { name: "Suche löschen" }).click();
  await expect(page.getByLabel("Suchen")).toHaveValue("");
  await expect(page.getByLabel("Suchen")).toBeFocused();
  await expect(status).toHaveText("Seite 1 von 1 (42 Elemente)");
  await expect(page.getByRole("button", { name: "Suche löschen" })).toHaveCount(0);

  await page.getByLabel("Filter Stadt").fill("Seeburg");
  await expect(rows.first()).toContainText("Seeburg");
  const count = await rows.count();
  for (let i = 0; i < count; i++) await expect(rows.nth(i)).toContainText("Seeburg");
  await page.getByRole("button", { name: "Stadt: Filter löschen" }).click();
  await expect(page.getByLabel("Filter Stadt")).toHaveValue("");
  await expect(status).toHaveText("Seite 1 von 1 (42 Elemente)");

  await page.getByLabel("Filter Kunde").fill("gibt es nicht");
  await expect(rows).toHaveText(["Keine Kunden gefunden."]);
});

test("Seitenleiste führt zu Bereichen und Auflistungen", async ({ page }) => {
  await login(page);
  await openMenu(page);
  const nav = page.getByRole("navigation", { name: "Hauptnavigation" }).locator("visible=true");
  await nav.getByRole("button", { name: "Software" }).click();
  await nav.getByRole("link", { name: "PMS-Module" }).click();
  await expect(page.getByText("Software · PMS-Module")).toBeVisible();
  await expect(page.getByText("Dieser Bereich folgt.")).toBeVisible();

  await openMenu(page);
  await nav.getByRole("link", { name: "Auflistungen" }).click();
  await expect(page.getByRole("heading", { name: "Auflistungen" })).toBeVisible();
  await expect(page.getByRole("link", { name: /Aufstellung Server/ })).toBeVisible();

  await openMenu(page);
  await nav.getByRole("link", { name: "Startseite" }).click();
  await expect(page.getByRole("heading", { name: "Kundenübersicht" })).toBeVisible();
});

test("Kopf- und Seitenleiste bleiben beim Scrollen stehen", async ({ page }, testInfo) => {
  await login(page);
  const header = page.locator("header");
  const scroll = page.getByTestId("table-scroll");
  const before = await header.boundingBox();
  // Nur die Tabellenzeilen scrollen, Seite und Kopfleiste bleiben stehen
  await scroll.evaluate((el) => el.scrollTo(0, el.scrollHeight));
  expect(await scroll.evaluate((el) => el.scrollTop)).toBeGreaterThan(0);
  expect(await page.evaluate("document.scrollingElement.scrollTop")).toBe(0);
  expect((await header.boundingBox())?.y).toBe(before?.y);
  await expect(header).toBeInViewport();
  await expect(page.getByTestId("table-status")).toBeInViewport();
  await expect(page.getByLabel("Filter Kunde")).toBeInViewport();
  if (testInfo.project.name === "desktop") {
    await expect(page.getByRole("navigation", { name: "Hauptnavigation" })).toBeInViewport();
    await expect(page.getByRole("button", { name: "Menü ein- oder ausblenden" })).toBeHidden();
  }
});

test("Körber-Blau als Primärfarbe, Hand über Knöpfen", async ({ page }) => {
  await page.goto("/login");
  const submit = page.getByRole("button", { name: "Anmelden" });
  await expect(submit).toHaveCSS("background-color", "rgb(0, 96, 255)");
  await expect(submit).toHaveCSS("cursor", "pointer");
  await login(page);
  await expect(page.locator("header")).toHaveCSS("background-color", "rgb(0, 96, 255)");
  await expect(page.getByRole("button", { name: "Abmelden" })).toHaveCSS("cursor", "pointer");
  await expect(page.getByRole("button", { name: "Vorherige Seite" })).toHaveCSS("cursor", "not-allowed");
});

test("Zeile anklicken markiert sie blau, Zellen zeigen den vollen Text als Tooltip", async ({ page }) => {
  await login(page);
  const row = page.getByRole("region", { name: "Kundenübersicht" }).locator("tbody tr").nth(1);
  const cell = row.locator("td").first();
  await expect(cell).toHaveAttribute("title", (await cell.textContent()) ?? "");
  await row.click();
  await expect(row).toHaveAttribute("aria-selected", "true");
  await expect(row).toHaveCSS("background-color", "rgb(0, 96, 255)");
  await row.click();
  await expect(row).toHaveAttribute("aria-selected", "false");
});

test.describe("System im dunklen Modus", () => {
  test.use({ colorScheme: "dark" });
  test("bleibt hell wie GAPTEQ", async ({ page }) => {
    await login(page);
    await expect(page.locator("body")).toHaveCSS("background-color", "rgb(245, 246, 248)");
    await expect(page.getByRole("region", { name: "Kundenübersicht" })).toHaveCSS("background-color", "rgb(255, 255, 255)");
  });
});

test("Tabelle füllt immer die ganze Höhe, auch bei wenigen Zeilen", async ({ page }) => {
  await login(page);
  await page.getByLabel("Filter Kunde").fill("gibt es nicht");
  await expect(page.getByTestId("table-status")).toHaveText("Seite 1 von 1 (0 Elemente)");
  const main = await page.locator("main").boundingBox();
  const table = await page.getByRole("region", { name: "Kundenübersicht" }).boundingBox();
  // Bis auf den Abstand und den Hinweis zu den Testdaten reicht die Tabelle bis unten
  expect(main!.y + main!.height - (table!.y + table!.height)).toBeLessThan(60);
});

test("Seitenleiste einklappbar auf Symbole, Wahl bleibt nach dem Neuladen", async ({ page }, testInfo) => {
  test.skip(testInfo.project.name !== "desktop", "Einklappen gibt es nur auf breiten Bildschirmen");
  await login(page);
  const sidebar = page.getByTestId("sidebar");
  const toggle = page.getByRole("button", { name: "Seitenleiste ein- oder ausklappen" });
  await expect(toggle).toHaveAttribute("aria-expanded", "true");
  await toggle.click();
  await expect(toggle).toHaveAttribute("aria-expanded", "false");
  await expect.poll(async () => (await sidebar.boundingBox())?.width).toBeLessThan(70);
  // Symbole bleiben benannt und anklickbar
  await expect(sidebar.getByRole("link", { name: "Startseite" })).toHaveAttribute("title", "Startseite");

  await page.reload();
  await expect(page.getByRole("heading", { name: "Kundenübersicht" })).toBeVisible();
  await expect(toggle).toHaveAttribute("aria-expanded", "false");

  // Klick auf eine Gruppe klappt die Leiste auf und öffnet die Gruppe
  await sidebar.getByRole("button", { name: "Hardware" }).click();
  await expect(toggle).toHaveAttribute("aria-expanded", "true");
  await expect(sidebar.getByRole("link", { name: "Server", exact: true })).toBeVisible();
});
