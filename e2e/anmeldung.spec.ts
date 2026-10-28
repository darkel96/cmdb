import { expect, test, type Page } from "@playwright/test";

async function login(page: Page, username: string, password = "test") {
  await page.goto("/");
  await expect(page).toHaveURL(/\/login$/);
  await page.getByLabel("Benutzername").fill(username);
  await page.getByLabel("Passwort").fill(password);
  await page.getByRole("button", { name: "Anmelden" }).click();
}

test("Testumgebung ist auf der Anmeldeseite deutlich gekennzeichnet", async ({ page }) => {
  await page.goto("/login");
  await expect(page.getByTestId("test-banner")).toContainText("Testumgebung");
  await expect(page.getByRole("heading", { name: "Anmelden" })).toBeVisible();
});

test("falsches Passwort wird abgelehnt", async ({ page }) => {
  await login(page, "user", "falsch");
  await expect(page.getByRole("alert")).toHaveText("Benutzername oder Passwort falsch.");
  await expect(page).toHaveURL(/\/login$/);
});

test("user sieht Startseite, aber keine Verwaltung", async ({ page }) => {
  await login(page, "user");
  await expect(page.getByRole("heading", { name: "Kundenübersicht" })).toBeVisible();
  await expect(page.getByTestId("user-name")).toHaveText("Test Benutzer");
  await expect(page.getByTestId("user-role")).toHaveText("Benutzer");
  await expect(page.getByTestId("test-banner")).toBeVisible();
  await expect(page.getByRole("link", { name: "Verwaltung" })).toHaveCount(0);

  // Direkter Aufruf führt zurück zur Startseite, die API liefert keine Details
  await page.goto("/verwaltung");
  await expect(page.getByRole("heading", { name: "Kundenübersicht" })).toBeVisible();
  const health = await (await page.request.get("/api/health")).json();
  expect(health.details).toBeUndefined();
});

test("admin sieht Verwaltung mit Status von LDAP und Datenbank", async ({ page }) => {
  await login(page, "admin");
  await expect(page.getByTestId("user-role")).toHaveText("Admin");
  await page.getByRole("link", { name: "Verwaltung" }).click();
  await expect(page.getByRole("heading", { name: "Verwaltung" })).toBeVisible();
  await expect(page.getByTestId("status-ldap")).toContainText("Verbunden");
  await expect(page.getByTestId("status-db")).toContainText("Verbunden");
});

test("Abmelden beendet die Sitzung", async ({ page, context }) => {
  await login(page, "admin");
  await expect(page.getByRole("heading", { name: "Kundenübersicht" })).toBeVisible();
  const cookie = (await context.cookies()).find((c) => c.name === "cmdb_session");
  expect(cookie?.httpOnly).toBe(true);
  expect(cookie?.sameSite).toBe("Strict");

  await page.getByRole("button", { name: "Abmelden" }).click();
  await expect(page).toHaveURL(/\/login$/);
  expect((await context.cookies()).find((c) => c.name === "cmdb_session")).toBeUndefined();
  expect((await page.request.get("/api/me")).status()).toBe(401);
  await page.goto("/verwaltung");
  await expect(page).toHaveURL(/\/login$/);
});

test("API: Sperre nach zu vielen Fehlversuchen, fremder Ursprung abgelehnt", async ({ request }, testInfo) => {
  // Je Projekt ein eigener Name, weil sich alle Projekte einen Dienst teilen
  const username = `gesperrt.${testInfo.project.name}`;
  const attempt = (password: string) => request.post("/api/login", { data: { username, password } });
  for (let i = 0; i < 5; i++) expect((await attempt("falsch")).status()).toBe(401);
  const locked = await attempt("falsch");
  expect(locked.status()).toBe(429);
  expect(locked.headers()["retry-after"]).toBeTruthy();

  const foreign = await request.post("/api/login", { data: { username: "admin", password: "test" }, headers: { Origin: "https://fremd.example" } });
  expect(foreign.status()).toBe(403);
});
