import { expect, test, type Page } from "@playwright/test";

async function login(page: Page, username: "admin" | "user") {
  await page.goto("/login");
  await page.getByLabel("Benutzername").fill(username);
  await page.getByLabel("Passwort").fill("test");
  await page.getByRole("button", { name: "Anmelden" }).click();
  await expect(page.getByRole("heading", { name: "Kundenübersicht" })).toBeVisible();
}

test("Stammdaten: Wert hinzufügen, umbenennen, löschen; Formular nutzt die neue Liste", async ({ page }, testInfo) => {
  const value = `Lieferant ${testInfo.project.name}`;
  await login(page, "admin");
  await page.goto("/stammdaten");
  const card = page.getByRole("region", { name: "Lieferant", exact: true });
  await expect(card.getByRole("list", { name: "Werte Lieferant" })).toContainText("Lieferant A");

  await card.getByRole("button", { name: "Lieferant: Wert hinzufügen" }).click();
  await card.getByLabel("Wert für Lieferant").fill(value);
  await card.getByRole("button", { name: "Übernehmen" }).click();
  await expect(card.getByRole("listitem").filter({ hasText: value })).toBeVisible();
  const form = await (await page.request.get("/api/areas/server/form")).json();
  expect(form.options.supplier).toContain(value);

  // Doppelt geht nicht
  await card.getByRole("button", { name: "Lieferant: Wert hinzufügen" }).click();
  await card.getByLabel("Wert für Lieferant").fill(value);
  await card.getByRole("button", { name: "Übernehmen" }).click();
  await expect(card.getByRole("alert")).toContainText("steht schon in der Liste");
  await card.getByRole("button", { name: "Abbrechen" }).click();

  await card.getByRole("button", { name: `${value} bearbeiten` }).click();
  await card.getByLabel("Wert für Lieferant").fill(`${value} neu`);
  await card.getByRole("button", { name: "Übernehmen" }).click();
  await expect(card.getByRole("listitem").filter({ hasText: `${value} neu` })).toBeVisible();

  await card.getByRole("button", { name: `${value} neu löschen` }).click();
  await card.getByRole("button", { name: "Ja, löschen" }).click();
  await expect(card.getByRole("listitem").filter({ hasText: value })).toHaveCount(0);
});

test("Stammdaten: Grundrolle darf nur lesen", async ({ page }) => {
  await login(page, "user");
  await page.goto("/stammdaten");
  await expect(page.getByRole("heading", { name: "Stammdaten" })).toBeVisible();
  await expect(page.getByRole("button", { name: /Wert hinzufügen/ })).toHaveCount(0);
  await expect(page.getByRole("button", { name: /bearbeiten$/ })).toHaveCount(0);
  expect((await page.request.post("/api/stammdaten/lieferant", { data: { value: "X" } })).status()).toBe(403);
});
