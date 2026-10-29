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

test("user sieht Startseite und in der Verwaltung nur die Stammdaten", async ({ page }) => {
  await login(page, "user");
  await expect(page.getByRole("heading", { name: "Kundenübersicht" })).toBeVisible();
  await expect(page.getByTestId("user-name")).toHaveText("Test Benutzer");
  await expect(page.getByTestId("user-role")).toHaveText("Benutzer");
  await expect(page.getByTestId("test-banner")).toBeVisible();
  // Grundrolle: nur Lesen, also weder Anlage Vertrag noch Status, Anmeldungen oder Rollen
  await page.getByRole("link", { name: "Verwaltung" }).click();
  await expect(page.getByRole("tab")).toHaveText(["Stammdaten"]);
  await page.goto("/verwaltung?tab=status");
  await expect(page.getByRole("tab", { name: "Stammdaten" })).toHaveAttribute("aria-selected", "true");
  await expect(page.getByTestId("status-ldap")).toHaveCount(0);
  await page.goto("/anlage-vertrag");
  await expect(page.getByRole("region", { name: "Anlage Vertrag" })).toHaveCount(0);
  const health = await (await page.request.get("/api/health")).json();
  expect(health.details).toBeUndefined();
});

test("admin sieht Verwaltung mit Status von LDAP und Datenbank", async ({ page }) => {
  await login(page, "admin");
  await expect(page.getByTestId("user-role")).toHaveText("Admin");
  await page.getByRole("link", { name: "Verwaltung" }).click();
  await expect(page.getByRole("heading", { name: "Verwaltung" })).toBeVisible();
  await expect(page.getByRole("tab")).toHaveText(["Anlage Vertrag", "Stammdaten", "Status", "Anmeldungen", "Rollen"]);
  await page.getByRole("tab", { name: "Status" }).click();
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

test("Angemeldet bleiben: längere Sitzung und Benutzername vorbelegt", async ({ page, context }) => {
  await page.goto("/login");
  await page.getByLabel("Benutzername").fill("admin");
  await page.getByLabel("Passwort").fill("test");
  await page.getByLabel("Angemeldet bleiben").check();
  await page.getByRole("button", { name: "Anmelden" }).click();
  await expect(page.getByRole("heading", { name: "Kundenübersicht" })).toBeVisible();
  const long = (await context.cookies()).find((c) => c.name === "cmdb_session")!;
  expect(long.expires * 1000 - Date.now()).toBeGreaterThan(6 * 24 * 3600 * 1000);

  await page.getByRole("button", { name: "Abmelden" }).click();
  await expect(page.getByLabel("Benutzername")).toHaveValue("admin");
  await expect(page.getByLabel("Angemeldet bleiben")).toBeChecked();
  await expect(page.getByLabel("Passwort")).toHaveValue("");

  // Ohne Häkchen: Sitzung wie bisher (8 Stunden), Name wird nicht mehr gemerkt
  await page.getByLabel("Angemeldet bleiben").uncheck();
  await page.getByLabel("Passwort").fill("test");
  await page.getByRole("button", { name: "Anmelden" }).click();
  await expect(page.getByRole("heading", { name: "Kundenübersicht" })).toBeVisible();
  const short = (await context.cookies()).find((c) => c.name === "cmdb_session")!;
  expect(short.expires * 1000 - Date.now()).toBeLessThan(9 * 3600 * 1000);
  expect(await page.evaluate(() => localStorage.getItem("cmdb-angemeldet-bleiben"))).toBeNull();
});
