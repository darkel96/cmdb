import { expect, test, type Page } from "@playwright/test";

async function login(page: Page, username: "admin" | "user") {
  await page.goto("/login");
  await page.getByLabel("Benutzername").fill(username);
  await page.getByLabel("Passwort").fill("test");
  await page.getByRole("button", { name: "Anmelden" }).click();
  await expect(page.getByRole("heading", { name: "Kundenübersicht" })).toBeVisible();
}

test("user darf Kunden weder anlegen noch bearbeiten", async ({ page }) => {
  await login(page, "user");
  await expect(page.getByRole("link", { name: "Anlegen" })).toHaveCount(0);
  await page.goto("/kunden/1");
  await expect(page.getByTestId("customer-name")).toBeVisible();
  await expect(page.getByRole("link", { name: "Bearbeiten" })).toHaveCount(0);
  expect((await page.request.post("/api/customers", { data: { values: { name: "X" } } })).status()).toBe(403);
  expect((await page.request.put("/api/customers/1", { data: { values: { name: "X" } } })).status()).toBe(403);
  expect((await page.request.delete("/api/customers/1", { data: {} })).status()).toBe(403);
});

test("admin legt Kunden an, benennt ihn um und löscht ihn", async ({ page }, testInfo) => {
  const name = `Neukunde ${testInfo.project.name} GmbH`;
  await login(page, "admin");
  await page.getByRole("link", { name: "Anlegen" }).click();
  await expect(page.getByRole("heading", { name: "Anlage Kunde" })).toBeVisible();
  const labels = (await page.locator("form label").allTextContents()).map((l) => l.trim());
  expect(labels).toEqual(["Kunde *", "Land", "Stadt"]);

  await page.getByRole("button", { name: "Speichern" }).click();
  await expect(page.getByRole("alert")).toHaveText("Bitte den Kunden angeben.");
  await page.locator("#k-name").fill(name);
  await page.getByLabel("Land").fill("Deutschland");
  await page.getByLabel("Stadt").fill("Musterstadt");
  await page.getByRole("button", { name: "Speichern" }).click();
  await expect(page.locator("main").getByRole("status")).toHaveText("Kunde wurde angelegt.");
  await expect(page.getByTestId("customer-name")).toHaveText(name);

  // Doppelter Name wird abgelehnt
  const dup = await page.request.post("/api/customers", { data: { values: { name } } });
  expect(dup.status()).toBe(409);

  await page.getByRole("link", { name: "Bearbeiten" }).click();
  await expect(page.getByRole("heading", { name: "Bearbeitung Kunde" })).toBeVisible();
  const editLabels = (await page.locator("form label").allTextContents()).map((l) => l.trim());
  expect(editLabels).toEqual(["Kunde *", "Land", "Stadt", "PLZ", "Adresse", "E-Mail"]);
  await page.locator("#k-name").fill(`${name} neu`);
  await expect(page.getByRole("note")).toContainText("mitgeändert");
  await page.getByLabel("PLZ").fill("12345");
  await page.getByRole("button", { name: "Speichern" }).click();
  await expect(page.locator("main").getByRole("status")).toHaveText("Kunde wurde gespeichert.");
  await expect(page.getByTestId("customer-name")).toHaveText(`${name} neu`);

  await page.getByRole("link", { name: "Bearbeiten" }).click();
  await page.getByRole("button", { name: "Löschen" }).click();
  await page.getByRole("button", { name: "Ja, löschen" }).click();
  await expect(page.locator("main").getByRole("status")).toHaveText(`Kunde „${name} neu“ wurde gelöscht.`);
});

test("Umbenennen nimmt die Systeme mit, Löschen mit Systemen wird abgelehnt", async ({ page }, testInfo) => {
  await login(page, "admin");
  // Kunde 1 hat im Testmodus Systeme; je Projekt ein anderer Kunde, weil sich die Projekte einen Dienst teilen
  const id = testInfo.project.name === "desktop" ? 1 : 2;
  const before = await (await page.request.get(`/api/customers/${id}`)).json();
  const systems = Object.values(before.systems as Record<string, unknown[]>).reduce((n, rows) => n + rows.length, 0);
  expect(systems).toBeGreaterThan(0);

  const res = await page.request.put(`/api/customers/${id}`, { data: { values: { ...before.customer, name: `${before.customer.name} (umbenannt)` } } });
  expect(res.status()).toBe(200);
  const saved = await res.json();
  expect(saved.renamed.reduce((n: number, r: { count: number }) => n + r.count, 0)).toBe(systems);
  const after = await (await page.request.get(`/api/customers/${id}`)).json();
  expect(Object.values(after.systems as Record<string, unknown[]>).reduce((n, rows) => n + rows.length, 0)).toBe(systems);

  const del = await page.request.delete(`/api/customers/${id}`, { data: {} });
  expect(del.status()).toBe(409);
  expect((await del.json()).error).toContain("Löschen nicht möglich");
});
