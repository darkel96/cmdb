import { expect, test, type Page } from "@playwright/test";

async function login(page: Page, username: "admin" | "user") {
  await page.goto("/login");
  await page.getByLabel("Benutzername").fill(username);
  await page.getByLabel("Passwort").fill("test");
  await page.getByRole("button", { name: "Anmelden" }).click();
  await expect(page.getByRole("heading", { name: "Kundenübersicht" })).toBeVisible();
}

test("user darf nicht anlegen", async ({ page }) => {
  await login(page, "user");
  await page.goto("/bereich/server");
  await expect(page.getByRole("heading", { name: "Übersicht Server" })).toBeVisible();
  await expect(page.getByRole("link", { name: "Anlegen" })).toHaveCount(0);
  await page.goto("/bereich/server/neu");
  await expect(page.getByRole("heading", { name: "Kundenübersicht" })).toBeVisible();
  const res = await page.request.post("/api/areas/server", { data: { values: { company: "x" } } });
  expect(res.status()).toBe(403);
});

test("admin legt über Anlage Vertrag einen Server an", async ({ page }) => {
  await login(page, "admin");
  await page.getByRole("link", { name: "Verwaltung" }).click();
  await page.getByRole("link", { name: "Anlage Vertrag" }).click();
  await expect(page.getByRole("heading", { name: "Anlage Vertrag" })).toBeVisible();
  await expect(page.getByRole("region", { name: "Anlage Vertrag" }).locator("[aria-disabled=true]", { hasText: "VMware" })).toContainText("folgt");
  await page.getByRole("region", { name: "Anlage Vertrag" }).getByRole("link", { name: "Server", exact: true }).click();

  await expect(page.getByRole("heading", { name: "Anlage Server" })).toBeVisible();
  const nextId = (await page.getByTestId("next-id").textContent())?.trim();
  expect(nextId).toMatch(/^\d+$/);
  await expect(page.getByLabel("EOL")).toHaveValue("Nein");
  // Hand über Auswahllisten und dem Kalendersymbol der Datumsfelder
  await expect(page.getByLabel("Hersteller")).toHaveCSS("cursor", "pointer");
  // Den Zeiger über dem Kalendersymbol meldet der Browser nicht; geprüft wird die Regel im Stylesheet
  expect(await page.evaluate("[...document.styleSheets].flatMap((s) => [...s.cssRules]).some((r) => r.cssText.includes('calendar-picker-indicator') && r.cssText.includes('cursor: pointer'))")).toBe(true);

  // Pflichtfelder leer: nicht gespeichert, Felder markiert
  await page.getByRole("button", { name: "Speichern" }).click();
  await expect(page.getByRole("alert")).toHaveText("Bitte alle Pflichtfelder (*) ausfüllen.");
  for (const label of ["Firma", "Hersteller", "Modell", "Servertyp"]) await expect(page.getByLabel(label)).toHaveAttribute("aria-invalid", "true");

  await page.getByLabel("Firma").selectOption({ index: 1 });
  await page.getByLabel("Hersteller").selectOption("Hersteller B");
  await page.getByLabel("Modell").fill("Rack Test 1U");
  await page.getByLabel("Servertyp").selectOption("Single Server");
  await page.getByLabel("Support bis").fill("2030-12-31");
  await page.getByLabel("Besonderheiten").fill("Angelegt im Test");
  await page.getByRole("button", { name: "Speichern" }).click();

  await expect(page.locator("main").getByRole("status")).toHaveText(`Server ${nextId} wurde angelegt.`);
  await expect(page.getByRole("heading", { name: new RegExp(`^Server ${nextId}`) })).toBeVisible();
  await expect(page.getByText("Rack Test 1U")).toBeVisible();
  await expect(page.getByText("31.12.2030")).toBeVisible();
});

test("API prüft Pflichtfelder und Auswahllisten", async ({ page }) => {
  await login(page, "admin");
  const missing = await page.request.post("/api/areas/server", { data: { values: { company: "Beispiel A AG" } } });
  expect(missing.status()).toBe(400);
  expect((await missing.json()).error).toBe("Hersteller ist ein Pflichtfeld.");
  const notInList = await page.request.post("/api/areas/server", {
    data: { values: { company: "Gibt es nicht GmbH", manufacturer: "Hersteller A", model: "X", serverType: "Single Server" } },
  });
  expect(notInList.status()).toBe(400);
  expect((await notInList.json()).error).toContain("steht nicht in der Auswahlliste");
  const unknown = await page.request.post("/api/areas/gibt-es-nicht", { data: { values: {} } });
  expect(unknown.status()).toBe(404);
});

test("Anlage Switch: Felder wie in GAPTEQ, LWL-Typ als Freitext", async ({ page }) => {
  await login(page, "admin");
  await page.goto("/anlage-vertrag");
  await page.getByRole("region", { name: "Anlage Vertrag" }).getByRole("link", { name: "Switche", exact: true }).click();
  await expect(page.getByRole("heading", { name: "Anlage Switch" })).toBeVisible();
  const labels = (await page.locator("form label").allTextContents()).map((l) => l.replace("*", "").trim());
  expect(labels).toEqual(["Firma", "Bestellnummer", "Lieferant", "Hersteller", "Modell", "Servicetag", "LWL-Typ", "Support bis", "Besonderheiten"]);
  await expect(page.getByLabel("Lieferant")).toHaveJSProperty("tagName", "SELECT");
  await expect(page.getByLabel("LWL-Typ")).toHaveJSProperty("tagName", "INPUT");

  await page.getByLabel("Firma").selectOption({ index: 2 });
  await page.getByLabel("Hersteller").selectOption("Hersteller A");
  await page.getByLabel("Modell").fill("Switch 48 Port");
  await page.getByLabel("LWL-Typ").fill("Multimode SR");
  await page.getByRole("button", { name: "Speichern" }).click();
  await expect(page.locator("main").getByRole("status")).toHaveText(/^Switch \d+ wurde angelegt\.$/);
  await expect(page.getByText("Multimode SR")).toBeVisible();
});

test("MDE: Übersicht mit Typ, Anlage mit Lieferant und Hersteller als Freitext", async ({ page }) => {
  await login(page, "admin");
  await page.goto("/bereich/mde");
  await expect(page.getByRole("heading", { name: "Übersicht MDEs" })).toBeVisible();
  const table = page.getByRole("region", { name: "Übersicht MDEs" });
  const headers = (await table.getByRole("columnheader").allTextContents()).map((h) => h.trim()).slice(0, 9);
  expect(headers).toEqual(["ID", "Firma", "Lieferant", "Bestellnummer", "Hersteller", "Seriennummer", "Support bis", "Besonderheiten", "Typ"]);

  await page.getByRole("link", { name: "Anlegen" }).click();
  await expect(page.getByRole("heading", { name: "Anlage MDE" })).toBeVisible();
  await expect(page.getByLabel("Lieferant")).toHaveJSProperty("tagName", "INPUT");
  await expect(page.getByLabel("Hersteller")).toHaveJSProperty("tagName", "INPUT");
  await page.getByLabel("Firma").selectOption({ index: 3 });
  await page.getByLabel("Hersteller").fill("Scanner XT");
  await page.getByLabel("Seriennummer").fill("SN-TEST-1");
  await page.getByRole("button", { name: "Speichern" }).click();
  await expect(page.locator("main").getByRole("status")).toHaveText(/^MDE \d+ wurde angelegt\.$/);
  await expect(page.locator("dd", { hasText: "SN-TEST-1" })).toBeVisible();
});

test("Storage: Spalten wie in GAPTEQ, Anlage mit Lieferant als Pflicht und Hersteller als Freitext", async ({ page }) => {
  await login(page, "admin");
  await page.goto("/bereich/storage");
  await expect(page.getByRole("heading", { name: "Übersicht Storage" })).toBeVisible();
  const headers = (await page.getByRole("region", { name: "Übersicht Storage" }).getByRole("columnheader").allTextContents()).map((h) => h.trim()).slice(0, 16);
  expect(headers).toEqual(["ID", "Firma", "Bestellnummer", "Lieferant", "Hersteller", "Modell", "Servicetag", "RAID", "Festplatten-Typ", "Anzahl Festplatten", "IP-Adresse", "Subnetz", "Gateway", "Wartungstyp", "Support bis", "Besonderheiten"]);

  await page.getByRole("link", { name: "Anlegen" }).click();
  await expect(page.getByRole("heading", { name: "Anlage Storage" })).toBeVisible();
  const labels = (await page.locator("form label").allTextContents()).map((l) => l.trim());
  expect(labels).toEqual(["Firma *", "Bestellnummer", "Lieferant *", "Hersteller *", "Modell", "Servicetag", "Wartungstyp", "Festplatten-Typ", "Anzahl Festplatten", "RAID", "IP-Adresse", "Subnetz", "Gateway", "Support bis", "Besonderheiten"]);
  await expect(page.getByLabel("Hersteller")).toHaveJSProperty("tagName", "INPUT");
  await expect(page.getByLabel("RAID")).toHaveJSProperty("tagName", "SELECT");

  await page.getByLabel("Firma").selectOption({ index: 4 });
  await page.getByLabel("Lieferant").selectOption("Lieferant A");
  await page.getByLabel("Hersteller").fill("HPE");
  await page.getByLabel("RAID").selectOption("5+0");
  await page.getByLabel("IP-Adresse").fill("192.0.2.200");
  await page.getByRole("button", { name: "Speichern" }).click();
  await expect(page.locator("main").getByRole("status")).toHaveText(/^Storage \d+ wurde angelegt\.$/);
  await expect(page.locator("dd", { hasText: "192.0.2.200" })).toBeVisible();
});

test("Client: Monitor nur beim Öffnen, Anlage mit Monitor als Auswahl", async ({ page }) => {
  await login(page, "admin");
  await page.goto("/bereich/client");
  await expect(page.getByRole("heading", { name: "Übersicht Client" })).toBeVisible();
  const headers = (await page.getByRole("region", { name: "Übersicht Client" }).getByRole("columnheader").allTextContents()).map((h) => h.trim()).slice(0, 7);
  expect(headers).toEqual(["ID", "Firma", "Lieferant", "Bestellnummer", "Hersteller", "Servicetag", "Besonderheiten"]);

  await page.getByRole("link", { name: "Anlegen" }).click();
  await expect(page.getByRole("heading", { name: "Anlage Client" })).toBeVisible();
  const labels = (await page.locator("form label").allTextContents()).map((l) => l.trim());
  expect(labels).toEqual(["Firma *", "Bestellnummer", "Lieferant", "Hersteller *", "Servicetag", "Monitor", "Besonderheiten"]);
  await page.getByLabel("Firma").selectOption({ index: 5 });
  await page.getByLabel("Hersteller").fill("Industrie-PC");
  await page.getByLabel("Monitor").selectOption("Ja");
  await page.getByRole("button", { name: "Speichern" }).click();
  await expect(page.locator("main").getByRole("status")).toHaveText(/^Client \d+ wurde angelegt\.$/);
  await expect(page.locator("dt", { hasText: "Monitor" })).toBeVisible();
});
