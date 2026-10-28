import { expect, test, type Page } from "@playwright/test";

async function login(page: Page, username: "admin" | "user") {
  await page.goto("/login");
  await page.getByLabel("Benutzername").fill(username);
  await page.getByLabel("Passwort").fill("test");
  await page.getByRole("button", { name: "Anmelden" }).click();
  await expect(page.getByRole("heading", { name: "Kundenübersicht" })).toBeVisible();
}

test("Eintrag bearbeiten: vorbelegt, gespeichert, Änderung angezeigt", async ({ page }, testInfo) => {
  await login(page, "admin");
  const id = testInfo.project.name === "desktop" ? 10003 : 10004;
  await page.goto(`/bereich/server/${id}`);
  await page.getByRole("link", { name: "Bearbeiten" }).click();
  await expect(page.getByRole("heading", { name: `Bearbeitung Server ${id}` })).toBeVisible();
  await expect(page.getByTestId("next-id")).toHaveText(String(id));
  const model = page.getByLabel(/^Modell/);
  await expect(model).not.toHaveValue("");
  await model.fill(`Rack geändert ${testInfo.project.name}`);
  await page.getByLabel("Besonderheiten").fill("geändert im Test");
  await page.getByRole("button", { name: "Speichern" }).click();
  await expect(page.locator("main").getByRole("status")).toHaveText(`Server ${id} wurde gespeichert (geändert: Modell, Besonderheiten).`);
  await expect(page.locator("dd", { hasText: `Rack geändert ${testInfo.project.name}` })).toBeVisible();
});

test("Bearbeiten erkennt zwischenzeitliche Änderungen und prüft das Recht", async ({ page, browser }, testInfo) => {
  await login(page, "admin");
  const id = testInfo.project.name === "desktop" ? 20005 : 20006;
  const row = await (await page.request.get(`/api/areas/switche/${id}`)).json();
  const original = Object.fromEntries(Object.entries(row).map(([k, v]) => [k, String(v ?? "")]));
  const first = await page.request.put(`/api/areas/switche/${id}`, { data: { values: { ...original, notes: "erste Änderung" }, original } });
  expect(first.status()).toBe(200);
  // Zweite Änderung mit dem alten Stand: abgelehnt, nichts überschrieben
  const second = await page.request.put(`/api/areas/switche/${id}`, { data: { values: { ...original, notes: "zweite Änderung" }, original } });
  expect(second.status()).toBe(409);
  expect((await second.json()).error).toContain("inzwischen geändert (Besonderheiten)");
  expect((await (await page.request.get(`/api/areas/switche/${id}`)).json()).notes).toBe("erste Änderung");

  const user = await browser.newPage();
  await login(user, "user");
  await user.goto(`/bereich/switche/${id}`);
  await expect(user.getByRole("heading", { name: new RegExp(`^Switch ${id}`) })).toBeVisible();
  await expect(user.getByRole("link", { name: "Bearbeiten" })).toHaveCount(0);
  const denied = await user.request.put(`/api/areas/switche/${id}`, { data: { values: original, original } });
  expect(denied.status()).toBe(403);
  await user.close();
});

test("Alter Listenwert darf beim Bearbeiten unverändert bleiben, neuer ungültiger nicht", async ({ page }, testInfo) => {
  await login(page, "admin");
  // Ein neuer Wert außerhalb der Auswahlliste wird abgelehnt; unverändertes Speichern geht immer
  const id = testInfo.project.name === "desktop" ? 10007 : 10008;
  const row = await (await page.request.get(`/api/areas/server/${id}`)).json();
  const original = Object.fromEntries(Object.entries(row).map(([k, v]) => [k, String(v ?? "")]));
  const bad = await page.request.put(`/api/areas/server/${id}`, { data: { values: { ...original, supplier: "Gibt es nicht" }, original } });
  expect(bad.status()).toBe(400);
  const sameAsBefore = await page.request.put(`/api/areas/server/${id}`, { data: { values: original, original } });
  expect(sameAsBefore.status()).toBe(200);
  expect((await sameAsBefore.json()).changed).toEqual([]);
});
