import { expect, test, type Page } from "@playwright/test";

async function login(page: Page, username: "admin" | "user") {
  await page.goto("/login");
  await page.getByLabel("Benutzername").fill(username);
  await page.getByLabel("Passwort").fill("test");
  await page.getByRole("button", { name: "Anmelden" }).click();
  await expect(page.getByRole("heading", { name: "Kundenübersicht" })).toBeVisible();
}

// Einstellungen gelten für den ganzen Testdienst: nacheinander, am Ende zurücksetzen
test.describe.configure({ mode: "serial" });

test("SMTP einrichten, Test-Mail senden und zurücksetzen", async ({ page }) => {
  await login(page, "admin");
  // Ausgangslage: SMTP aus der .env (im Test leer), auch nach einem abgebrochenen Lauf
  expect((await page.request.delete("/api/admin/settings/smtp", { data: {} })).status()).toBe(200);
  await page.goto("/verwaltung?tab=status");
  const smtp = page.getByTestId("status-smtp");
  await expect(page.getByTestId("status-ldap")).toContainText("Verbunden");
  await expect(page.getByTestId("status-db")).toContainText("Verbunden");
  await expect(smtp).toContainText("Nicht eingerichtet");

  await smtp.getByRole("button", { name: "Bearbeiten" }).click();
  await smtp.getByLabel("Server").fill("mail.example.loc");
  await smtp.getByLabel("Absenderadresse").fill("falsch");
  await smtp.getByRole("button", { name: "Speichern" }).click();
  await expect(smtp.getByRole("alert")).toContainText("Absenderadresse");

  await smtp.getByLabel("Absenderadresse").fill("cmdb@example.loc");
  await smtp.getByLabel("Passwort", { exact: true }).fill("Geheim-Mail-1");
  await smtp.getByRole("button", { name: "Verbindung testen" }).click();
  await expect(smtp.getByRole("status").first()).toContainText("Verbindung klappt.");
  await smtp.getByRole("button", { name: "Speichern" }).click();
  await expect(smtp).toContainText("Gespeichert und wirksam.");
  await expect(smtp).toContainText("Verbunden");
  await expect(smtp).toContainText("In der Verwaltung geändert");

  // Passwort kommt nie zurück
  const settings = await (await page.request.get("/api/admin/settings")).json();
  expect(JSON.stringify(settings)).not.toContain("Geheim-Mail-1");
  expect(settings.sections.smtp.passwordSet).toBe(true);
  expect(settings.changedBy).toBe("admin");

  await smtp.getByLabel("Test-Mail an").fill("test@example.loc");
  await smtp.getByRole("button", { name: "Test-Mail senden" }).click();
  await expect(smtp).toContainText("Testmodus: an test@example.loc wäre jetzt eine Test-Mail gegangen.");

  await smtp.getByRole("button", { name: "Auf .env zurücksetzen" }).click();
  await expect(smtp).toContainText("Nicht eingerichtet");
  expect((await (await page.request.get("/api/admin/settings")).json()).sections.smtp.passwordSet).toBe(false);
});

test("LDAP: ungültige Adresse wird nicht gespeichert, Datenbank-Passwort nur verdeckt", async ({ page }) => {
  await login(page, "admin");
  await page.goto("/verwaltung?tab=status");
  const ldap = page.getByTestId("status-ldap");
  await ldap.getByRole("button", { name: "Bearbeiten" }).click();
  await expect(ldap.getByLabel("Server-Adresse")).not.toHaveValue("");
  await ldap.getByLabel("Server-Adresse").fill("http://dc.example.loc");
  await ldap.getByRole("button", { name: "Speichern" }).click();
  await expect(ldap.getByRole("alert")).toContainText("ldaps://");
  await ldap.getByRole("button", { name: "Abbrechen" }).click();
  expect((await (await page.request.get("/api/admin/settings")).json()).sections.ldap.changed).toEqual([]);

  const db = page.getByTestId("status-db");
  await db.getByRole("button", { name: "Bearbeiten" }).click();
  await expect(db.getByLabel("Passwort", { exact: true })).toHaveAttribute("type", "password");
  await expect(db.getByLabel("Passwort", { exact: true })).toHaveValue("");
  await expect(db.getByRole("button", { name: "Entfernen" })).toHaveCount(0);
});

test("Einstellungen nur für Admins", async ({ page }) => {
  await login(page, "user");
  expect((await page.request.get("/api/admin/settings")).status()).toBe(403);
  expect((await page.request.put("/api/admin/settings/smtp", { data: { values: { host: "x", port: 25, security: "none", user: "", from: "a@b.cd", fromName: "" } } })).status()).toBe(403);
  expect((await page.request.post("/api/admin/settings/smtp/testmail", { data: { to: "a@b.cd" } })).status()).toBe(403);
});
