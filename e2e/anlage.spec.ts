import { expect, test, type Page } from "@playwright/test";

/** Eigene Auswahlliste: aufklappen und Eintrag wählen (nach Text oder als n-ter Eintrag ohne „keine Auswahl“) */
async function choose(page: Page, label: string, option: string | number) {
  // Beschriftung genau, mit oder ohne Pflicht-Sternchen („OS“ darf nicht „Hostname“ treffen)
  await page.getByLabel(new RegExp(`^${label}( \\*)?$`)).click();
  const list = page.getByRole("listbox");
  const entries = list.getByRole("option").filter({ hasNotText: "– keine Auswahl –" });
  await (typeof option === "number" ? entries.nth(option) : list.getByRole("option", { name: option, exact: true })).click();
  await expect(list).toBeHidden();
}

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
  await expect(page.getByText("Dafür fehlt die Berechtigung.")).toBeVisible();
  await expect(page.getByRole("heading", { name: "Anlage Server" })).toHaveCount(0);
  const res = await page.request.post("/api/areas/server", { data: { values: { company: "x" } } });
  expect(res.status()).toBe(403);
});

test("admin legt über Anlage Vertrag einen Server an", async ({ page }) => {
  await login(page, "admin");
  await page.getByRole("link", { name: "Verwaltung" }).click();
  await page.locator("main").getByRole("link", { name: "Anlage Vertrag" }).click();
  await expect(page.getByRole("heading", { name: "Anlage Vertrag" })).toBeVisible();
  // Alle zwölf Typen wie in GAPTEQ sind anlegbar
  await expect(page.getByRole("region", { name: "Anlage Vertrag" }).getByRole("link")).toHaveCount(12);
  await expect(page.getByRole("region", { name: "Anlage Vertrag" }).locator("[aria-disabled=true]")).toHaveCount(0);
  await page.getByRole("region", { name: "Anlage Vertrag" }).getByRole("link", { name: "Server", exact: true }).click();

  await expect(page.getByRole("heading", { name: "Anlage Server" })).toBeVisible();
  const nextId = (await page.getByTestId("next-id").textContent())?.trim();
  expect(nextId).toMatch(/^\d+$/);
  await expect(page.getByLabel("EOL")).toHaveText("Nein");
  // Hand über Auswahllisten und dem Kalendersymbol der Datumsfelder
  await expect(page.getByLabel("Hersteller")).toHaveCSS("cursor", "pointer");
  // Den Zeiger über dem Kalendersymbol meldet der Browser nicht; geprüft wird die Regel im Stylesheet
  expect(await page.evaluate("[...document.styleSheets].flatMap((s) => [...s.cssRules]).some((r) => r.cssText.includes('calendar-picker-indicator') && r.cssText.includes('cursor: pointer'))")).toBe(true);

  // Pflichtfelder leer: nicht gespeichert, Felder markiert
  await page.getByRole("button", { name: "Speichern" }).click();
  await expect(page.getByRole("alert")).toHaveText("Bitte alle Pflichtfelder (*) ausfüllen.");
  for (const label of ["Firma", "Hersteller", "Modell", "Servertyp"]) await expect(page.getByLabel(label)).toHaveAttribute("aria-invalid", "true");

  await choose(page, "Firma", 0);
  await choose(page, "Hersteller", "Hersteller B");
  await page.getByLabel("Modell").fill("Rack Test 1U");
  await choose(page, "Servertyp", "Single Server");
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
  // Eine gültige Firma aus der Auswahlliste (andere Tests benennen Testkunden um)
  const company = (await (await page.request.get("/api/areas/server/form")).json()).options.company[0];
  const missing = await page.request.post("/api/areas/server", { data: { values: { company } } });
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
  await expect(page.getByLabel("Lieferant")).toHaveAttribute("role", "combobox");
  await expect(page.getByLabel("LWL-Typ")).toHaveJSProperty("tagName", "INPUT");

  await choose(page, "Firma", 1);
  await choose(page, "Hersteller", "Hersteller A");
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
  await choose(page, "Firma", 2);
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
  await expect(page.getByLabel("RAID")).toHaveAttribute("role", "combobox");

  await choose(page, "Firma", 3);
  await choose(page, "Lieferant", "Lieferant A");
  await page.getByLabel("Hersteller").fill("HPE");
  await choose(page, "RAID", "5+0");
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
  await choose(page, "Firma", 4);
  await page.getByLabel("Hersteller").fill("Industrie-PC");
  await choose(page, "Monitor", "Ja");
  await page.getByRole("button", { name: "Speichern" }).click();
  await expect(page.locator("main").getByRole("status")).toHaveText(/^Client \d+ wurde angelegt\.$/);
  await expect(page.locator("dt", { hasText: "Monitor" })).toBeVisible();
});

test("Auswahlliste: Suche filtert, Pfeiltasten und Enter wählen, Hand als Zeiger", async ({ page }) => {
  await login(page, "admin");
  await page.goto("/bereich/server/neu");
  await expect(page.getByRole("heading", { name: "Anlage Server" })).toBeVisible();
  const firma = page.getByLabel("Firma");
  await expect(firma).toHaveCSS("cursor", "pointer");
  await firma.click();
  await page.getByLabel("Auswahl durchsuchen").fill("muster");
  const options = page.getByRole("listbox").getByRole("option");
  await expect(options).toHaveCount(6);
  await expect(options.first()).toHaveCSS("cursor", "pointer");
  await page.keyboard.press("ArrowDown");
  await page.keyboard.press("Enter");
  await expect(firma).toHaveText(/^Muster /);

  // Nicht-Pflichtfeld lässt sich wieder leeren
  await choose(page, "Lieferant", "Lieferant B");
  await expect(page.getByLabel("Lieferant")).toHaveText("Lieferant B");
  await page.getByLabel("Lieferant").click();
  await page.getByRole("option", { name: "– keine Auswahl –" }).click();
  await expect(page.getByLabel("Lieferant")).toHaveText("– bitte wählen –");
});

test("Software- und Lizenzanlagen: Felder wie in GAPTEQ, Lieferant als Freitext", async ({ page }) => {
  await login(page, "admin");
  const forms: Record<string, { title: string; labels: string[] }> = {
    vmware: { title: "Anlage VMware", labels: ["Firma *", "Bestellnummer", "Lieferant", "Lizenznehmer", "Lizenztyp", "Lizenz", "Support bis", "Besonderheiten"] },
    tsplus: { title: "Anlage TSPLUS", labels: ["Firma *", "Bestellnummer", "Lieferant", "Lizenztyp", "Lizenz", "Anzahl Lizenzen", "Support bis", "Besonderheiten"] },
    prtg: { title: "Anlage PRTG", labels: ["Firma *", "Bestellnummer", "Lieferant", "Lieferdatum", "Anzahl Sensoren", "Support bis", "EOL", "Besonderheiten"] },
    veeam: { title: "Anlage VEEAM", labels: ["Firma *", "Bestellnummer", "Lieferant", "Lizenznehmer", "Lizenztyp", "Lizenz", "Support bis", "Besonderheiten"] },
    lizenzen: { title: "Anlage Windows-Lizenzen", labels: ["Firma *", "Bestellnummer", "Lieferant", "Lizenznehmer", "Lizenztyp", "Lizenz", "Support bis", "Besonderheiten"] },
  };
  for (const [id, form] of Object.entries(forms)) {
    await page.goto(`/bereich/${id}/neu`);
    await expect(page.getByRole("heading", { name: form.title })).toBeVisible();
    await expect(page.getByTestId("next-id")).toHaveText(/^\d+$/);
    expect((await page.locator("form label").allTextContents()).map((l) => l.trim()), id).toEqual(form.labels);
    await expect(page.getByLabel("Lieferant")).toHaveJSProperty("tagName", "INPUT");
  }
  await expect(page.getByLabel("Firma")).toHaveAttribute("role", "combobox");

  await choose(page, "Firma", 6);
  await page.getByLabel("Lieferant").fill("Händler X");
  await page.getByLabel("Lizenztyp").fill("Windows Server 2025 Standard");
  await page.getByRole("button", { name: "Speichern" }).click();
  await expect(page.locator("main").getByRole("status")).toHaveText(/^Lizenz \d+ wurde angelegt\.$/);
  await expect(page.locator("dd", { hasText: "Windows Server 2025 Standard" })).toBeVisible();
});

test("Anlage Oracle mit Hostname und RMAN-Passwort, Anlage Windows-System mit festem EOL", async ({ page, context }) => {
  await login(page, "admin");
  await page.goto("/bereich/oracle/neu");
  await expect(page.getByRole("heading", { name: "Anlage Oracle" })).toBeVisible();
  const oracleLabels = (await page.locator("form label").allTextContents()).map((l) => l.trim());
  expect(oracleLabels).toEqual([
    "Firma *", "DB-Typ *", "DB-Version", "Linux/Windows", "Hostname", "Zeichensatz", "SGA", "PGA", "RMAN-Copy-Job *", "RMAN-Pfad", "RMAN-Benutzer",
    "RMAN-Passwort", "DNS-Server", "IP-Adresse", "Gateway", "Softwarepflege *", "Softwarepflege bis", "IT-Servicevertrag *", "IT-Service bis", "Besonderheiten",
  ]);
  // Passwortfeld verdeckt, Auge zeigt die Eingabe
  const pw = page.getByLabel("RMAN-Passwort", { exact: true });
  await expect(pw).toHaveAttribute("type", "password");
  await page.getByRole("button", { name: "RMAN-Passwort anzeigen" }).click();
  await expect(pw).toHaveAttribute("type", "text");

  const company = (await (await page.request.get("/api/areas/oracle/form")).json()).options.company[0];
  const res = await page.request.post("/api/areas/oracle", {
    data: { values: { company, dbType: "Oracle XE", hostname: "ora-demo-neu", rmanCopyJob: "Nein", softwareContract: "Nein", itServiceContract: "Nein", rmanPassword: "Geheim-123" } },
  });
  expect(res.status()).toBe(201);
  const id = (await res.json()).id;
  // Liste und Detail enthalten das Passwort nie, nur der eigene Abruf
  const created = await (await page.request.get(`/api/areas/oracle/${id}`)).json();
  expect(created.hostname).toBe("ora-demo-neu");
  expect(JSON.stringify(created)).not.toContain("Geheim-123");
  expect(JSON.stringify(await (await page.request.get("/api/areas/oracle")).json())).not.toContain("Geheim-123");
  expect((await (await page.request.get(`/api/areas/oracle/${id}/secret`)).json()).value).toBe("Geheim-123");

  // Detail: verdeckt, Auge zeigt, Kopieren legt es in die Zwischenablage
  await context.grantPermissions(["clipboard-read", "clipboard-write"]);
  await page.goto(`/bereich/oracle/${id}`);
  await expect(page.getByTestId("secret-value")).toHaveText("••••••••");
  await page.getByRole("button", { name: "RMAN-Passwort anzeigen" }).click();
  await expect(page.getByTestId("secret-value")).toHaveText("Geheim-123");
  await page.getByRole("button", { name: "RMAN-Passwort verbergen" }).click();
  await expect(page.getByTestId("secret-value")).toHaveText("••••••••");
  await page.getByRole("button", { name: "RMAN-Passwort kopieren" }).click();
  await expect(page.getByRole("status").filter({ hasText: "Kopiert" })).toBeVisible();
  expect(await page.evaluate("navigator.clipboard.readText()")).toBe("Geheim-123");

  // Bearbeiten: leer lassen = unverändert, neue Eingabe überschreibt
  const original = { ...created };
  const keep = await page.request.put(`/api/areas/oracle/${id}`, { data: { values: { ...created, rmanPassword: "" }, original } });
  expect((await keep.json()).changed).toEqual([]);
  expect((await (await page.request.get(`/api/areas/oracle/${id}/secret`)).json()).value).toBe("Geheim-123");
  const change = await page.request.put(`/api/areas/oracle/${id}`, { data: { values: { ...created, rmanPassword: "Neu-456" }, original } });
  expect((await change.json()).changed).toEqual(["RMAN-Passwort"]);
  expect((await (await page.request.get(`/api/areas/oracle/${id}/secret`)).json()).value).toBe("Neu-456");

  // Entfernen: im Formular per Knopf, gespeichert wird ein leeres Passwort
  await page.goto(`/bereich/oracle/${id}/bearbeiten`);
  await page.getByRole("button", { name: "Entfernen" }).click();
  await expect(page.getByLabel("RMAN-Passwort", { exact: true })).toBeDisabled();
  await page.getByRole("button", { name: "Speichern" }).click();
  await expect(page.locator("main").getByRole("status")).toContainText("RMAN-Passwort");
  expect((await (await page.request.get(`/api/areas/oracle/${id}/secret`)).json()).value).toBe("");

  await page.goto("/bereich/windows/neu");
  await expect(page.getByRole("heading", { name: "Anlage Windows-System" })).toBeVisible();
  const windowsLabels = (await page.locator("form label").allTextContents()).map((l) => l.trim());
  expect(windowsLabels).toEqual(["Firma *", "Servertyp *", "Hostname", "IP", "Subnetz", "Gateway", "OS", "WinCC", "Hardware", "Bereitgestellt", "Besonderheiten"]);
  await expect(page.locator("section", { hasText: "Anlage Windows-System" }).getByText("EOL", { exact: true })).toBeVisible();
  await choose(page, "Firma", 7);
  await choose(page, "Servertyp", "APP-Server");
  await choose(page, "OS", "Windows Server 2025");
  await page.getByLabel("Hostname").fill("app-demo-neu");
  await page.getByRole("button", { name: "Speichern" }).click();
  await expect(page.locator("main").getByRole("status")).toHaveText(/^Windows-System \d+ wurde angelegt\.$/);
  await expect(page.locator("dd", { hasText: "app-demo-neu" })).toBeVisible();
  await expect(page.locator("dt", { hasText: "EOL" }).locator("xpath=following-sibling::dd[1]")).toHaveText("Nein");
});

test("Grundrolle sieht das Oracle-Passwort nur verdeckt und kann es nicht abrufen", async ({ page }) => {
  await login(page, "user");
  await page.goto("/bereich/oracle/100000");
  await expect(page.getByText("RMAN-Passwort")).toBeVisible();
  await expect(page.getByRole("button", { name: /RMAN-Passwort (anzeigen|kopieren)/ })).toHaveCount(0);
  expect((await page.request.get("/api/areas/oracle/100000/secret")).status()).toBe(403);
  expect((await page.request.get("/api/areas/server/10000/secret")).status()).toBe(404);
});
