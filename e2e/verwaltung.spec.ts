import { expect, test, type Page } from "@playwright/test";

async function login(page: Page, username: "admin" | "user", password = "test") {
  await page.goto("/login");
  await page.getByLabel("Benutzername").fill(username);
  await page.getByLabel("Passwort").fill(password);
  await page.getByRole("button", { name: "Anmelden" }).click();
}

test("Verwaltung zeigt das Anmelde-Protokoll mit erfolgreichen und fehlgeschlagenen Anmeldungen", async ({ page }) => {
  await login(page, "user", "falsch");
  await expect(page.getByRole("alert")).toBeVisible();
  await login(page, "admin");
  await expect(page.getByRole("heading", { name: "Kundenübersicht" })).toBeVisible();
  await page.goto("/verwaltung?tab=anmeldungen");
  await expect(page.getByRole("tab", { name: "Anmeldungen" })).toHaveAttribute("aria-selected", "true");
  const table = page.getByRole("region", { name: "Anmeldungen" });
  await expect(table.locator("tbody tr").first()).toContainText("admin");
  await expect(table.locator("tbody tr").first()).toContainText("Erfolgreich");
  await expect(table.locator("tbody tr", { hasText: "Fehlgeschlagen" }).first()).toContainText("Benutzername oder Passwort falsch");
});

test("Rolle gibt einer Person Rechte je Bereich, ohne Rolle wieder nur Lesen", async ({ browser }, testInfo) => {
  const roleName = `Hardware-Team ${testInfo.project.name}`;
  const admin = await browser.newPage();
  await login(admin, "admin");
  await expect(admin.getByRole("heading", { name: "Kundenübersicht" })).toBeVisible();
  await admin.goto("/verwaltung?tab=rollen");
  await expect(admin.getByText("Alle Angemeldeten")).toBeVisible();
  await admin.getByRole("button", { name: "Neue Rolle" }).click();
  await admin.getByLabel("Name", { exact: true }).fill(roleName);
  await admin.getByLabel("Server: Anlegen").check();
  await expect(admin.getByLabel("Server: Lesen")).toBeChecked();
  await admin.getByLabel("Anmeldename").fill("user");
  await admin.getByRole("button", { name: "Hinzufügen" }).click();
  await admin.getByRole("button", { name: "Rolle speichern" }).click();
  const card = admin.getByRole("list", { name: "Rollen" }).getByRole("listitem").filter({ hasText: roleName });
  await expect(card).toContainText("Person user");

  try {
    const user = await browser.newPage();
    await login(user, "user");
    await expect(user.getByRole("heading", { name: "Kundenübersicht" })).toBeVisible();
    // Startseite: Kunden anlegen weiterhin nicht
    await expect(user.getByRole("link", { name: "Anlegen" })).toHaveCount(0);
    await user.goto("/bereich/server");
    await expect(user.getByRole("link", { name: "Anlegen" })).toBeVisible();
    expect((await user.request.get("/api/areas/server/form")).status()).toBe(200);
    expect((await user.request.get("/api/areas/switche/form")).status()).toBe(403);
    expect((await user.request.get("/api/admin/roles")).status()).toBe(403);
    await user.goto("/anlage-vertrag");
    const tiles = user.getByRole("region", { name: "Anlage Vertrag" });
    await expect(tiles.getByRole("link", { name: "Server", exact: true })).toBeVisible();
    await expect(tiles.locator("[aria-disabled=true]", { hasText: "Switche" })).toBeVisible();
    await user.close();
  } finally {
    await card.getByRole("button", { name: `${roleName} löschen` }).click();
    await admin.getByRole("button", { name: "Ja, löschen" }).click();
    await expect(card).toHaveCount(0);
  }

  const after = await browser.newPage();
  await login(after, "user");
  await expect(after.getByRole("heading", { name: "Kundenübersicht" })).toBeVisible();
  expect((await after.request.get("/api/areas/server/form")).status()).toBe(403);
});

test("Grundrolle lässt sich nicht löschen, Rollen-API nur für Admins", async ({ page }) => {
  await login(page, "admin");
  await expect(page.getByRole("heading", { name: "Kundenübersicht" })).toBeVisible();
  const roles = await (await page.request.get("/api/admin/roles")).json();
  const base = roles.items.find((r: { isDefault: boolean }) => r.isDefault);
  expect((await page.request.delete(`/api/admin/roles/${base.id}`, { data: {} })).status()).toBe(409);
  expect((await page.request.post("/api/admin/roles", { data: { role: { name: "" } } })).status()).toBe(400);
});
