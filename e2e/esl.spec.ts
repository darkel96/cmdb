import { expect, test, type Page } from "@playwright/test";

async function login(page: Page, username: "admin" | "user") {
  await page.goto("/login");
  await page.getByLabel("Benutzername").fill(username);
  await page.getByLabel("Passwort").fill("test");
  await page.getByRole("button", { name: "Anmelden" }).click();
  await expect(page.getByRole("heading", { name: "Kundenübersicht" })).toBeVisible();
}

// Jedes Projekt (desktop/mobil) nutzt eigene Verträge, die Daten im Testmodus sind gemeinsam
const contract = (project: string, offset: number) => 1000000 + offset + (project === "desktop" ? 0 : 3);

test("Oracle-ESL bearbeiten: Abschnitte wie GAPTEQ, Kunde fest, Status aus der Liste, kein Löschen", async ({ page }, testInfo) => {
  await login(page, "admin");
  const id = contract(testInfo.project.name, 1);
  await page.goto(`/bereich/oracle-esl/${id}`);
  await expect(page.getByRole("button", { name: "Löschen" })).toHaveCount(0);
  await expect(page.getByRole("region", { name: "Dokumente" })).toHaveCount(0);
  await page.getByRole("link", { name: "Bearbeiten" }).click();
  await expect(page.getByRole("heading", { name: `Bearbeitung Oracle-ESL ${id}` })).toBeVisible();
  // Abschnitte nach Zuständigkeit
  const sections = page.locator("fieldset legend");
  await expect(sections).toHaveText(["Grunddaten", "Oracle-Lizenzdaten", "Oracle-Supportvertrag", "Kunden-Hotlinevertrag", "Buchhaltung"]);
  // Kunde nur beim Anlegen
  await expect(page.getByRole("group", { name: "Grunddaten" }).getByLabel("Kunde", { exact: true })).not.toHaveRole("combobox");

  await page.getByLabel("SAP-Projektnummer").fill(`SAP-${testInfo.project.name}`);
  await page.getByRole("group", { name: "Oracle-Supportvertrag" }).getByLabel("Status").click();
  await page.getByRole("listbox").getByRole("option", { name: "In Klärung", exact: true }).click();
  await page.getByRole("button", { name: "Speichern" }).click();
  await expect(page.locator("main").getByRole("status")).toHaveText(`Oracle-ESL ${id} wurde gespeichert (geändert: SAP-Projektnummer, Oracle-Support Status).`);
  await expect(page.locator("dd", { hasText: `SAP-${testInfo.project.name}` })).toBeVisible();

  // Löschen gibt es für Oracle-ESL nicht (kein DELETE auf dbo.Vertragsdaten)
  expect((await page.request.delete(`/api/areas/oracle-esl/${id}`, { data: { original: {} } })).status()).toBe(404);
});

test("Feldgruppen-Recht: Service ändert nur den Hotlinevertrag", async ({ browser }, testInfo) => {
  const roleName = `ESL-Service ${testInfo.project.name}`;
  const id = contract(testInfo.project.name, 2);
  const admin = await browser.newPage();
  await login(admin, "admin");
  await admin.goto("/verwaltung?tab=rollen");
  await admin.getByRole("button", { name: "Neue Rolle" }).click();
  await admin.getByLabel("Name", { exact: true }).fill(roleName);
  await admin.getByLabel("Oracle-ESL › Service: Bearbeiten").check();
  await expect(admin.getByLabel("Oracle-ESL › Service: Lesen")).toHaveCount(0);
  await admin.getByLabel("Anmeldename").fill("user");
  await admin.getByRole("button", { name: "Hinzufügen" }).click();
  await admin.getByRole("button", { name: "Rolle speichern" }).click();
  const card = admin.getByRole("list", { name: "Rollen" }).getByRole("listitem").filter({ hasText: roleName });
  await expect(card).toContainText("Person user");

  try {
    const user = await browser.newPage();
    await login(user, "user");
    const before = await (await user.request.get(`/api/areas/oracle-esl/${id}`)).json();
    await user.goto(`/bereich/oracle-esl/${id}`);
    await user.getByRole("link", { name: "Bearbeiten" }).click();
    await expect(user.getByRole("heading", { name: `Bearbeitung Oracle-ESL ${id}` })).toBeVisible();
    // Nur die Felder der Gruppe sind Eingabefelder
    await expect(user.getByRole("textbox", { name: "SAP-Projektnummer" })).toHaveCount(0);
    // Änderbare Felder sind hervorgehoben
    const hotline = user.getByRole("group", { name: "Kunden-Hotlinevertrag" });
    await expect(hotline.getByLabel("SAP-Auftragsnummer")).toHaveClass(/bg-brand\/5/);
    await expect(user.getByText("Felder, die du ändern darfst")).toBeVisible();
    await hotline.getByLabel("SAP-Auftragsnummer").fill(`HL-${testInfo.project.name}`);
    await user.getByRole("button", { name: "Speichern" }).click();
    await expect(user.locator("main").getByRole("status")).toHaveText(`Oracle-ESL ${id} wurde gespeichert (geändert: Kunde Hotline SAP-Auftrag).`);

    // Über die API geschickte fremde Felder werden nicht übernommen
    const now = await (await user.request.get(`/api/areas/oracle-esl/${id}`)).json();
    const original = Object.fromEntries(Object.entries(now).map(([k, v]) => [k, String(v ?? "")]));
    const res = await user.request.put(`/api/areas/oracle-esl/${id}`, { data: { values: { ...original, sapProject: "nicht erlaubt", hotlineSapOrder: "HL-2" }, original } });
    expect(res.status()).toBe(200);
    const after = await (await user.request.get(`/api/areas/oracle-esl/${id}`)).json();
    expect(after.sapProject).toBe(before.sapProject);
    expect(after.hotlineSapOrder).toBe("HL-2");
    // Andere Bereiche weiterhin nicht
    expect((await user.request.put("/api/areas/server/10001", { data: { values: {}, original: {} } })).status()).toBe(403);
    await user.close();
  } finally {
    await card.getByRole("button", { name: `${roleName} löschen` }).click();
    await admin.getByRole("button", { name: "Ja, löschen" }).click();
    await expect(card).toHaveCount(0);
  }
});

test("Oracle-ESL anlegen über Anlage Vertrag", async ({ page }, testInfo) => {
  await login(page, "admin");
  await page.goto("/verwaltung?tab=anlage-vertrag");
  await page.getByRole("region", { name: "Anlage Vertrag" }).getByRole("link", { name: "Oracle-ESL" }).click();
  await expect(page.getByRole("heading", { name: "Anlage Oracle-ESL" })).toBeVisible();
  await page.getByLabel(/^Kunde( \*)?$/).click();
  await page.getByRole("listbox").getByRole("option").nth(1).click();
  await page.getByLabel("SAP-Projektnummer").fill(`NEU-${testInfo.project.name}`);
  await page.getByRole("button", { name: "Speichern" }).click();
  await expect(page.locator("main").getByRole("status")).toContainText("wurde angelegt");
  await expect(page).toHaveURL(/\/bereich\/oracle-esl\/\d+$/);
  await expect(page.locator("dd", { hasText: `NEU-${testInfo.project.name}` })).toBeVisible();
});

test("PMS-Module am Vertrag: hinzufügen aus der Preisliste, Preise ändern, entfernen; Grundrolle nur lesen", async ({ page, browser }, testInfo) => {
  await login(page, "admin");
  // Vertrag ohne Module (jeder dritte im Testmodus)
  const id = testInfo.project.name === "desktop" ? 1000002 : 1000005;
  await page.goto(`/bereich/oracle-esl/${id}`);
  const panel = page.getByRole("region", { name: "PMS-Module" });
  await expect(panel).toContainText("Keine PMS-Module");

  await panel.getByRole("button", { name: "Modul hinzufügen" }).click();
  await page.getByLabel("PMS-Modul aus der Preisliste").click();
  await page.getByRole("listbox").getByRole("option", { name: "Testmodul Lager", exact: true }).click();
  await panel.getByRole("button", { name: "Hinzufügen", exact: true }).click();
  await expect(panel.locator("tbody tr")).toHaveCount(1);
  await expect(panel.locator("tbody")).toContainText("4.500,00 €");

  // Preise je Vertrag ändern, Summe folgt
  await panel.getByRole("button", { name: "Testmodul Lager: Preise ändern" }).click();
  await panel.getByLabel("Testmodul Lager: PMS-Listenpreis").fill("4.000,50");
  await panel.getByRole("button", { name: "Speichern" }).click();
  await expect(panel.locator("tfoot")).toContainText("4.000,50 €");
  await panel.getByRole("button", { name: "Testmodul Lager: Preise ändern" }).click();
  await panel.getByLabel("Testmodul Lager: PMS-Listenpreis").fill("abc");
  await panel.getByRole("button", { name: "Speichern" }).click();
  await expect(panel.getByRole("alert")).toContainText("ungültiger Betrag");
  await panel.getByRole("button", { name: "Abbrechen" }).click();

  // Die Grundrolle sieht die Module, aber keine Knöpfe; die API lehnt ab
  const user = await browser.newPage();
  await login(user, "user");
  await user.goto(`/bereich/oracle-esl/${id}`);
  const userPanel = user.getByRole("region", { name: "PMS-Module" });
  await expect(userPanel).toContainText("Testmodul Lager");
  await expect(userPanel.getByRole("button")).toHaveCount(0);
  await expect(user.getByRole("link", { name: "Bearbeiten" })).toHaveCount(0);
  expect((await user.request.post("/api/pms-module", { data: { contractId: id, module: "Testmodul Basis" } })).status()).toBe(403);
  await user.close();

  // Zweimal dasselbe Modul nicht
  expect((await page.request.post("/api/pms-module", { data: { contractId: id, module: "Testmodul Lager" } })).status()).toBe(409);

  await panel.getByRole("button", { name: "Testmodul Lager entfernen" }).click();
  await panel.getByRole("button", { name: "Ja" }).click();
  await expect(panel).toContainText("Keine PMS-Module");

  // Änderungen stehen im Verlauf des Vertrags
  await page.reload();
  const history = page.getByRole("region", { name: "Änderungsverlauf" });
  await expect(history).toContainText("PMS-Modul hinzugefügt");
  await expect(history).toContainText("PMS-Modul entfernt");
});

test("Verwaltung › Stammdaten › PMS-Modularten: Preisliste pflegen, Umbenennen folgt an den Verträgen", async ({ page, browser }, testInfo) => {
  await login(page, "admin");
  const name = `Testmodul Neu ${testInfo.project.name}`;
  await page.goto("/verwaltung?tab=stammdaten");
  await page.getByRole("navigation", { name: "Auswahllisten" }).getByRole("button", { name: /PMS-Modularten/ }).click();
  const panel = page.getByRole("region", { name: "PMS-Modularten" });

  // Neues Modul mit Preisen
  await panel.getByRole("button", { name: "Modul hinzufügen" }).click();
  await panel.getByLabel("Name des Moduls").fill(name);
  await panel.getByLabel("PMS-Listenpreis").fill("1.500,00");
  await panel.getByLabel("Oracle-Lizenzkosten").fill("200");
  await panel.getByLabel("Oracle-Wartungskosten").fill("40,5");
  await panel.getByRole("button", { name: "Übernehmen" }).click();
  const row = panel.locator("tbody tr", { hasText: name });
  await expect(row).toContainText("1.500,00 €");
  await expect(row).toContainText("40,50 €");

  // Ein Modul an Verträgen: umbenennen ändert den Namen dort mit, löschen geht nicht
  const before = (await (await page.request.get("/api/pms-module")).json()) as { items: { module: string }[] };
  const used = before.items.filter((m) => m.module === "Testmodul Versand").length;
  expect(used).toBeGreaterThan(0);
  await panel.getByRole("button", { name: "Testmodul Versand löschen" }).click();
  await panel.getByRole("button", { name: "Ja, löschen" }).click();
  await expect(panel.getByRole("alert")).toContainText("hängt noch an");
  await panel.getByRole("button", { name: "Testmodul Versand bearbeiten" }).click();
  await panel.getByLabel("Name des Moduls").fill(`Versand ${testInfo.project.name}`);
  await panel.getByRole("button", { name: "Übernehmen" }).click();
  await expect(panel.getByRole("status")).toContainText(`an ${used} Oracle-ESL-Vertr`);
  const after = (await (await page.request.get("/api/pms-module")).json()) as { items: { module: string }[] };
  expect(after.items.filter((m) => m.module === `Versand ${testInfo.project.name}`)).toHaveLength(used);
  // Wieder zurück, damit andere Tests den alten Namen finden
  await panel.getByRole("button", { name: `Versand ${testInfo.project.name} bearbeiten` }).click();
  await panel.getByLabel("Name des Moduls").fill("Testmodul Versand");
  await panel.getByRole("button", { name: "Übernehmen" }).click();
  await expect(panel.locator("tbody tr", { hasText: "Testmodul Versand" })).toHaveCount(1);

  // Die Grundrolle sieht die Preisliste, darf aber nichts ändern
  const user = await browser.newPage();
  await login(user, "user");
  await user.goto("/verwaltung?tab=stammdaten");
  await user.getByRole("navigation", { name: "Auswahllisten" }).getByRole("button", { name: /PMS-Modularten/ }).click();
  await expect(user.getByRole("region", { name: "PMS-Modularten" })).toContainText(name);
  await expect(user.getByRole("region", { name: "PMS-Modularten" }).getByRole("button")).toHaveCount(0);
  expect((await user.request.post("/api/pms-preisliste", { data: { entry: { module: "x", listPrice: 1, licenseCost: 1, maintenanceCost: 1 } } })).status()).toBe(403);
  await user.close();

  // Unbenutztes Modul löschen
  await panel.getByRole("button", { name: `${name} löschen` }).click();
  await panel.getByRole("button", { name: "Ja, löschen" }).click();
  await expect(row).toHaveCount(0);
});
