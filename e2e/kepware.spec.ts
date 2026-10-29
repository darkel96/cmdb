import { expect, test, type Page } from "@playwright/test";

async function login(page: Page, username: "admin" | "user") {
  await page.goto("/login");
  await page.getByLabel("Benutzername").fill(username);
  await page.getByLabel("Passwort").fill("test");
  await page.getByRole("button", { name: "Anmelden" }).click();
  await expect(page.getByRole("heading", { name: "Kundenübersicht" })).toBeVisible();
}

test("KEPware: Übersicht, Anlage über Anlage Vertrag, Nummernkreis ab 130000, Notfall-Key verdeckt", async ({ page }, testInfo) => {
  await login(page, "admin");
  await page.goto("/bereich/kepware");
  await expect(page.getByRole("heading", { name: "Übersicht KEPware" })).toBeVisible();

  await page.goto("/verwaltung?tab=anlage-vertrag");
  await page.getByRole("region", { name: "Anlage Vertrag" }).getByRole("link", { name: "KEPware", exact: true }).click();
  await expect(page.getByRole("heading", { name: "Anlage KEPware-Lizenz" })).toBeVisible();
  const labels = (await page.locator("form label").allTextContents()).map((l) => l.trim());
  expect(labels).toEqual([
    "Firma *", "Produkt/Edition *", "Version", "Lizenznehmer", "Lieferant", "Bestellnummer", "Lieferdatum", "Lizenzkey", "Notfall-Key",
    "Server/Hostname", "Support bis", "EOL", "Besonderheiten",
  ]);
  const nextId = Number((await page.getByTestId("next-id").textContent())?.trim());
  expect(nextId).toBeGreaterThanOrEqual(130000);

  const key = `NOTFALL-${testInfo.project.name}`;
  const company = (await (await page.request.get("/api/areas/kepware/form")).json()).options.company[0];
  const res = await page.request.post("/api/areas/kepware", {
    data: { values: { company, product: "OPC-Server Standard", version: "6.16", licenseKey: "TEST-KEY-1", emergencyKey: key, supportUntil: "2026-12-31", eol: "Nein" } },
  });
  expect(res.status(), await res.text()).toBe(201);
  const { id } = await res.json();
  expect(id).toBeGreaterThanOrEqual(130000);
  expect(id).toBeLessThan(131000);

  // Notfall-Key nie in Liste oder Detaildaten, nur einzeln
  expect(JSON.stringify(await (await page.request.get("/api/areas/kepware")).json())).not.toContain(key);
  expect(JSON.stringify(await (await page.request.get(`/api/areas/kepware/${id}`)).json())).not.toContain(key);
  expect((await (await page.request.get(`/api/areas/kepware/${id}/secret`)).json()).value).toBe(key);
  await page.goto(`/bereich/kepware/${id}`);
  await expect(page.getByTestId("secret-value")).toHaveText("••••••••");
  await page.getByRole("button", { name: "Notfall-Key anzeigen" }).click();
  await expect(page.getByTestId("secret-value")).toHaveText(key);

  // Auslaufende Kundensysteme: KEPware ist dabei (Support bis Jahresende liegt im Zeitraum)
  await page.goto("/auflistungen/auslaufend");
  await expect(page.getByRole("group", { name: "Bereiche ein- und ausblenden" }).getByRole("button", { name: /^KEPware/ })).toBeVisible();
});

test("KEPware: Grundrolle liest, legt aber nicht an und sieht den Notfall-Key nicht", async ({ page }) => {
  await login(page, "user");
  await page.goto("/bereich/kepware/130000");
  await expect(page.getByText("Notfall-Key")).toBeVisible();
  await expect(page.getByRole("button", { name: /Notfall-Key anzeigen/ })).toHaveCount(0);
  expect((await page.request.get("/api/areas/kepware/130000/secret")).status()).toBe(403);
  expect((await page.request.post("/api/areas/kepware", { data: { values: { company: "x", product: "y" } } })).status()).toBe(403);
});
