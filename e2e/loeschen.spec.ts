import { expect, test, type Page } from "@playwright/test";

async function login(page: Page, username: "admin" | "user") {
  await page.goto("/login");
  await page.getByLabel("Benutzername").fill(username);
  await page.getByLabel("Passwort").fill("test");
  await page.getByRole("button", { name: "Anmelden" }).click();
  await expect(page.getByRole("heading", { name: "Kundenübersicht" })).toBeVisible();
}

test("Eintrag löschen mit Rückfrage; die Nummer wird beim nächsten Anlegen wieder vergeben", async ({ page }) => {
  await login(page, "admin");
  const form = await (await page.request.get("/api/areas/storage/form")).json();
  const company = form.options.company[0];
  // Pflichtfelder aus dem Formular füllen: erste Auswahl bzw. Testtext
  const values: Record<string, string> = { company, manufacturer: form.options.manufacturer?.[0] ?? "Gerät Test", model: "Zum Löschen", serviceTag: "DEL-1" };
  for (const [key, options] of Object.entries(form.options as Record<string, string[]>)) values[key] ??= options[0];
  const res = await page.request.post("/api/areas/storage", { data: { values } });
  expect(res.status(), await res.text()).toBe(201);
  const { id } = await res.json();

  await page.goto(`/bereich/storage/${id}`);
  await page.getByRole("button", { name: "Löschen" }).click();
  await page.getByRole("alertdialog", { name: "Löschen bestätigen" }).getByRole("button", { name: "Abbrechen" }).click();
  await expect(page.getByRole("alertdialog")).toHaveCount(0);
  await page.getByRole("button", { name: "Löschen" }).click();
  await page.getByRole("button", { name: "Ja, löschen" }).click();
  await expect(page).toHaveURL(/\/bereich\/storage$/);
  await expect(page.locator("main").getByRole("status")).toHaveText(`Storage ${id} wurde gelöscht.`);
  expect((await page.request.get(`/api/areas/storage/${id}`)).status()).toBe(404);

  // Kleinste freie Nummer: die gelöschte ist wieder dran
  expect((await (await page.request.get("/api/areas/storage/form")).json()).nextId).toBe(id);
});

test("Löschen prüft zwischenzeitliche Änderungen und das Recht", async ({ page, browser }) => {
  await login(page, "admin");
  const row = (await (await page.request.get("/api/areas/server")).json()).items[3];
  const original = Object.fromEntries(Object.entries(row).filter(([k]) => k !== "id").map(([k, v]) => [k, String(v ?? "")]));
  const stale = await page.request.delete(`/api/areas/server/${row.id}`, { data: { original: { ...original, model: "veraltet" } } });
  expect(stale.status()).toBe(409);

  const user = await browser.newPage();
  await login(user, "user");
  await user.goto(`/bereich/server/${row.id}`);
  await expect(user.getByRole("heading", { name: new RegExp(`^Server ${row.id}`) })).toBeVisible();
  await expect(user.getByRole("button", { name: "Löschen" })).toHaveCount(0);
  expect((await user.request.delete(`/api/areas/server/${row.id}`, { data: { original } })).status()).toBe(403);
  await user.close();
});

test("Gelöschter erfundener Eintrag: die Nummer wird einmal neu vergeben, nicht doppelt", async ({ page }) => {
  await login(page, "admin");
  const items = (await (await page.request.get("/api/areas/mde")).json()).items;
  const row = items[2];
  const original = Object.fromEntries(Object.entries(row).filter(([k]) => k !== "id").map(([k, v]) => [k, String(v ?? "")]));
  expect((await page.request.delete(`/api/areas/mde/${row.id}`, { data: { original } })).status()).toBe(204);
  const form = await (await page.request.get("/api/areas/mde/form")).json();
  expect(form.nextId).toBe(row.id);
  const values: Record<string, string> = { company: form.options.company[0], serialNumber: "NEU-1", manufacturer: "Gerät Test", model: "Gerät Test" };
  for (const [key, options] of Object.entries(form.options as Record<string, string[]>)) values[key] ??= options[0];
  const res = await page.request.post("/api/areas/mde", { data: { values } });
  expect(res.status(), await res.text()).toBe(201);
  expect((await res.json()).id).toBe(row.id);
  const after = (await (await page.request.get("/api/areas/mde")).json()).items.filter((r: { id: number }) => r.id === row.id);
  expect(after).toHaveLength(1);
  expect(after[0].serialNumber).toBe("NEU-1");
});
