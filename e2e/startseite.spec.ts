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
  await page.getByLabel("Suchen").fill("");

  await page.getByLabel("Filter Stadt").fill("Seeburg");
  await expect(rows.first()).toContainText("Seeburg");
  const count = await rows.count();
  for (let i = 0; i < count; i++) await expect(rows.nth(i)).toContainText("Seeburg");

  await page.getByLabel("Filter Kunde").fill("gibt es nicht");
  await expect(rows).toHaveText(["Keine Kunden gefunden."]);
});

test("Seitenleiste führt zu Bereichen und Auflistungen", async ({ page }) => {
  await login(page);
  await openMenu(page);
  const nav = page.getByRole("navigation", { name: "Hauptnavigation" }).locator("visible=true");
  await nav.getByRole("button", { name: "Hardware" }).click();
  await nav.getByRole("link", { name: "Server" }).click();
  await expect(page.getByText("Hardware · Server")).toBeVisible();
  await expect(page.getByText("Dieser Bereich folgt.")).toBeVisible();

  await openMenu(page);
  await nav.getByRole("link", { name: "Auflistungen" }).click();
  await expect(page.getByRole("heading", { name: "Configuration Items" })).toBeVisible();
  await expect(page.getByTestId("table-status")).toHaveText("Seite 1 von 1 (8 Elemente)");

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
