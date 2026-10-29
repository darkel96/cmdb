import { expect, test, type Page } from "@playwright/test";

async function login(page: Page) {
  await page.goto("/login");
  await page.getByLabel("Benutzername").fill("admin");
  await page.getByLabel("Passwort").fill("test");
  await page.getByRole("button", { name: "Anmelden" }).click();
  await expect(page.getByRole("heading", { name: "Kundenübersicht" })).toBeVisible();
}

test("Änderungsverlauf: Anlegen, Ändern (alt → neu), Status, Dokument; Passwort nie mit Wert", async ({ page }) => {
  await login(page);
  const form = await (await page.request.get("/api/areas/oracle/form")).json();
  const values: Record<string, string> = { hostname: "ora-verlauf", dbVersion: "19.3.0.0", rmanPassword: "Geheim-Verlauf-1" };
  for (const [key, options] of Object.entries(form.options as Record<string, string[]>)) values[key] ??= options[0];
  const created = await page.request.post("/api/areas/oracle", { data: { values } });
  expect(created.status(), await created.text()).toBe(201);
  const { id } = await created.json();

  const row = await (await page.request.get(`/api/areas/oracle/${id}`)).json();
  const original = Object.fromEntries(Object.entries(row).filter(([k]) => k !== "id").map(([k, v]) => [k, String(v ?? "")]));
  const edited = await page.request.put(`/api/areas/oracle/${id}`, { data: { values: { ...original, dbVersion: "19.22.0.0", rmanPassword: "Geheim-Verlauf-2" }, original } });
  expect(edited.status(), await edited.text()).toBe(200);
  expect((await page.request.post(`/api/areas/oracle/${id}/documents`, { data: { name: "Lizenz.pdf", data: "eA==" } })).status()).toBe(201);

  const history = await (await page.request.get(`/api/history/oracle/${id}`)).json();
  expect(history.items.map((h: { action: string }) => h.action)).toEqual(["dokument", "geändert", "angelegt"]);
  expect(JSON.stringify(history)).not.toContain("Geheim-Verlauf");

  await page.goto(`/bereich/oracle/${id}`);
  const panel = page.getByRole("region", { name: "Änderungsverlauf" });
  await expect(panel).toContainText("DB-Version: 19.3.0.0 → 19.22.0.0");
  await expect(panel).toContainText("RMAN-Passwort: geändert");
  await expect(panel).toContainText("Datei: Lizenz.pdf");
  await expect(panel).toContainText("admin");

  // Status (Auslaufende Kundensysteme) an einem Server
  const server = (await (await page.request.get("/api/areas/server")).json()).items.find((r: { status: string }) => !r.status);
  expect((await page.request.put(`/api/areas/server/${server.id}/status`, { data: { values: { status: "Angeboten" }, original: { status: "" } } })).status()).toBe(200);
  await page.goto(`/bereich/server/${server.id}`);
  await expect(page.getByRole("region", { name: "Änderungsverlauf" })).toContainText("Status: – → Angeboten");
});

test("Änderungsverlauf beim Kunden; Grundrolle liest ihn", async ({ page, browser }) => {
  await login(page);
  const created = await page.request.post("/api/customers", { data: { values: { name: "Verlauf Test GmbH", country: "Deutschland", city: "Altstadt" } } });
  expect(created.status(), await created.text()).toBe(201);
  const { id } = await created.json();
  expect((await page.request.put(`/api/customers/${id}`, { data: { values: { name: "Verlauf Test GmbH", country: "Deutschland", city: "Neustadt", zip: "", address: "", email: "" } } })).status()).toBe(200);
  await page.goto(`/kunden/${id}`);
  await expect(page.getByRole("region", { name: "Änderungsverlauf" })).toContainText("Stadt: Altstadt → Neustadt");

  const user = await browser.newPage();
  await user.goto("/login");
  await user.getByLabel("Benutzername").fill("user");
  await user.getByLabel("Passwort").fill("test");
  await user.getByRole("button", { name: "Anmelden" }).click();
  await expect(user.getByRole("heading", { name: "Kundenübersicht" })).toBeVisible();
  expect((await user.request.get(`/api/history/kunden/${id}`)).status()).toBe(200);
  await user.close();
  expect((await page.request.delete(`/api/customers/${id}`, { data: {} })).status()).toBe(204);
});
