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
  await page.getByRole("navigation", { name: "Auswahllisten" }).getByRole("button", { name: /^Lieferant/ }).click();
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
  await expect(page.getByRole("tab", { name: "Stammdaten" })).toHaveAttribute("aria-selected", "true");
  await expect(page.getByRole("button", { name: /Wert hinzufügen/ })).toHaveCount(0);
  await expect(page.getByRole("button", { name: /bearbeiten$/ })).toHaveCount(0);
  expect((await page.request.post("/api/stammdaten/lieferant", { data: { value: "X" } })).status()).toBe(403);
});

test("Stammdaten-Recht je Liste: Rolle darf nur bei Hersteller anlegen", async ({ browser }, testInfo) => {
  const roleName = `Stammdaten Hersteller ${testInfo.project.name}`;
  const value = `Hersteller ${testInfo.project.name}`;
  const admin = await browser.newPage();
  await login(admin, "admin");
  await admin.goto("/verwaltung?tab=rollen");
  await admin.getByRole("button", { name: "Neue Rolle" }).click();
  await admin.getByLabel("Name", { exact: true }).fill(roleName);
  await admin.getByRole("button", { name: "Stammdaten (alle Listen): Listen aufklappen" }).click();
  await admin.getByLabel("Stammdaten › Hersteller: Anlegen").check();
  await expect(admin.getByLabel("Stammdaten › PMS-Modularten: Bearbeiten")).toBeVisible();
  await admin.getByLabel("Anmeldename").fill("user");
  await admin.getByRole("button", { name: "Hinzufügen" }).click();
  await admin.getByRole("button", { name: "Rolle speichern" }).click();
  const card = admin.getByRole("list", { name: "Rollen" }).getByRole("listitem").filter({ hasText: roleName });
  await expect(card).toContainText("Person user");

  try {
    const user = await browser.newPage();
    await login(user, "user");
    await user.goto("/verwaltung?tab=stammdaten");
    const lists = user.getByRole("navigation", { name: "Auswahllisten" });
    await lists.getByRole("button", { name: /^Hersteller/ }).click();
    await user.getByRole("button", { name: "Hersteller: Wert hinzufügen" }).click();
    await user.getByLabel("Wert für Hersteller").fill(value);
    await user.getByRole("button", { name: "Übernehmen" }).click();
    await expect(user.getByRole("list", { name: "Werte Hersteller" })).toContainText(value);
    // Nur Anlegen: kein Bearbeiten/Löschen, andere Listen gar nicht
    await expect(user.getByRole("button", { name: `${value} bearbeiten` })).toHaveCount(0);
    await lists.getByRole("button", { name: /^RAID/ }).click();
    await expect(user.getByRole("button", { name: /Wert hinzufügen/ })).toHaveCount(0);
    expect((await user.request.post("/api/stammdaten/raid", { data: { value: "X" } })).status()).toBe(403);
    expect((await user.request.delete("/api/stammdaten/hersteller", { data: { value } })).status()).toBe(403);
    await user.close();
  } finally {
    await card.getByRole("button", { name: `${roleName} löschen` }).click();
    await admin.getByRole("button", { name: "Ja, löschen" }).click();
    await expect(card).toHaveCount(0);
    expect((await admin.request.delete("/api/stammdaten/hersteller", { data: { value } })).status()).toBe(200);
  }
});
