import { expect, test, type Page } from "@playwright/test";
import { expiringWindow } from "../src/lib/expiring";

async function login(page: Page, username: "admin" | "user" = "admin") {
  await page.goto("/login");
  await page.getByLabel("Benutzername").fill(username);
  await page.getByLabel("Passwort").fill("test");
  await page.getByRole("button", { name: "Anmelden" }).click();
  await expect(page.getByRole("heading", { name: "Kundenübersicht" })).toBeVisible();
}

async function open(page: Page) {
  await page.goto("/bereich/auflistungen");
  await page.getByRole("link", { name: /Auslaufende Kundensysteme/ }).click();
  await expect(page.getByRole("heading", { name: "Auslaufende Kundensysteme" })).toBeVisible();
  // Warten, bis alle Bereiche geladen sind
  await expect(page.getByRole("group", { name: "Bereiche ein- und ausblenden" })).not.toContainText("…");
}

const table = (page: Page) => page.getByRole("region", { name: /^(Offen|Archiv) · / });
const rowOf = (page: Page, area: string, id: string) =>
  table(page)
    .locator("tbody tr")
    .filter({ has: page.locator("td:nth-child(1)", { hasText: new RegExp(`^${area}$`) }) })
    .filter({ has: page.locator("td:nth-child(2)", { hasText: new RegExp(`^${id}$`) }) });

test("Auslaufende Kundensysteme: eine Tabelle, nur Support-Ende in 9 Monaten oder abgelaufen, EOL rot, Kunde filtert", async ({ page }) => {
  await login(page);
  await open(page);
  const t = table(page);
  await expect(t).toHaveAccessibleName("Offen · Alle Kunden");
  await t.getByRole("button", { name: /^(20|100)$/ }).last().click();
  const header = (await t.locator("thead tr").first().locator("th").allTextContents()).map((h) => h.trim());
  const col = (name: string) => header.findIndex((h) => h.startsWith(name));
  // Regel: Support-Ende in den nächsten 9 Monaten oder abgelaufen (src/lib/expiring.ts)
  const { to } = expiringWindow();
  const rows = t.locator("tbody tr");
  const n = await rows.count();
  expect(n).toBeGreaterThan(5);
  for (let i = 0; i < n; i++) {
    const cells = rows.nth(i).locator("td");
    const [d, m, y] = (await cells.nth(col("Support bis")).textContent())!.split(".").map(Number);
    const iso = `${2000 + y}-${String(m).padStart(2, "0")}-${String(d).padStart(2, "0")}`;
    expect(iso <= to, `${iso} liegt bis ${to}`).toBe(true);
    expect(["Verlängert", "Abgeschlossen"]).not.toContain((await cells.nth(col("Status")).textContent())?.trim());
    if ((await cells.nth(col("EOL")).textContent())?.trim() === "Ja") await expect(rows.nth(i)).toHaveAttribute("data-highlight", "true");
    else await expect(rows.nth(i)).not.toHaveAttribute("data-highlight");
  }
  // Mehrere Bereiche in derselben Tabelle
  const areas = new Set(await rows.locator(`td:nth-child(${col("Bereich") + 1})`).allTextContents());
  expect(areas.size).toBeGreaterThan(2);

  // Kunde wählen filtert
  const first = page.getByRole("list", { name: "Kundenliste" }).getByRole("button").first();
  const name = (await first.getAttribute("title"))!;
  await first.click();
  await expect(t).toHaveAccessibleName(`Offen · ${name}`);
  for (const c of await t.locator(`tbody td:nth-child(${col("Firma") + 1})`).allTextContents()) expect(c.trim()).toBe(name);

  // „Alle Kunden“ steht über der scrollenden Liste und bleibt beim Scrollen sichtbar
  await page.getByRole("list", { name: "Kundenliste" }).evaluate((el) => el.scrollTo(0, el.scrollHeight));
  await expect(page.getByRole("button", { name: "Alle Kunden" })).toBeInViewport();

  // Bereich ausblenden
  await page.getByRole("button", { name: "Alle Kunden" }).click();
  const chip = page.getByRole("group", { name: "Bereiche ein- und ausblenden" }).getByRole("button", { name: /^Server/ });
  await chip.click();
  await expect(chip).toHaveAttribute("aria-pressed", "false");
  await expect(t.locator(`tbody td:nth-child(${col("Bereich") + 1})`, { hasText: /^Server$/ })).toHaveCount(0);
});

test("Status-Filter gilt für die ganze Seite: Tabelle, Kundenliste und Zähler", async ({ page }) => {
  test.slow();
  await login(page);
  await open(page);
  const t = table(page);
  const filter = page.getByRole("group", { name: "Nach Status filtern" });
  // Im Reiter „Offen“ nur offene Status, Verlängert/Abgeschlossen gibt es dort nicht
  await expect(filter.getByRole("button")).toHaveText([/^Alle/, /^Ohne Status/, /^Angeboten/, /^In Bearbeitung/]);

  // Eine Zeile auf „In Bearbeitung“ setzen (dritte Zeile, die erste nutzt der Archiv-Test)
  const row = t.locator("tbody tr").nth(2);
  const id = (await row.locator("td").nth(1).textContent())!.trim();
  const area = (await row.locator("td").nth(0).textContent())!.trim();
  const company = (await row.locator("td").nth(2).textContent())!.trim();
  await row.getByRole("combobox").click();
  await page.getByRole("option", { name: "In Bearbeitung" }).click();
  await expect(rowOf(page, area, id).getByRole("combobox")).toHaveText("In Bearbeitung");

  await filter.getByRole("button", { name: /^In Bearbeitung/ }).click();
  await expect(t).toHaveAccessibleName("Offen · Alle Kunden · In Bearbeitung");
  await expect(rowOf(page, area, id)).toBeVisible();
  for (const c of await t.locator("tbody tr").getByRole("combobox").allTextContents()) expect(c.trim()).toBe("In Bearbeitung");
  // Kundenliste zeigt nur Kunden mit diesem Status
  await expect(page.getByRole("list", { name: "Kundenliste" }).getByRole("button", { name: company })).toBeVisible();

  // Zurück auf offen, dann ist die Zeile unter „In Bearbeitung“ weg
  await rowOf(page, area, id).getByRole("combobox").click();
  await page.getByRole("option", { name: "– keine Auswahl –" }).click();
  await expect(rowOf(page, area, id)).toHaveCount(0);

  // Im Archiv: Verlängert und Abgeschlossen
  await page.getByRole("tab", { name: /Archiv/ }).click();
  await expect(filter.getByRole("button")).toHaveText([/^Alle/, /^Verlängert/, /^Abgeschlossen/]);
});

test("Status in der Zeile: Verlängert verschiebt ins Archiv, zurück auf offen holt es wieder", async ({ page }) => {
  // Viele Schritte über zwei Reiter; auf langsamen Prüf-Rechnern (GitHub) mehr Zeit als die üblichen 30 s
  test.slow();
  await login(page);
  await open(page);
  const t = table(page);
  const row = t.locator("tbody tr").first();
  const id = (await row.locator("td").nth(1).textContent())!.trim();
  const area = (await row.locator("td").nth(0).textContent())!.trim();
  await row.getByRole("combobox").click();
  await page.getByRole("option", { name: "Verlängert" }).click();
  await expect(rowOf(page, area, id)).toHaveCount(0);

  await page.getByRole("tab", { name: /Archiv/ }).click();
  await expect(t).toHaveAccessibleName("Archiv · Alle Kunden");
  await t.getByLabel("Suchen", { exact: true }).fill(id);
  const archived = rowOf(page, area, id);
  await expect(archived).toContainText("Verlängert");
  await archived.getByRole("combobox").click();
  await page.getByRole("option", { name: "– keine Auswahl –" }).click();
  await expect(rowOf(page, area, id)).toHaveCount(0);
  await page.getByRole("tab", { name: /Offen/ }).click();
  await t.getByLabel("Suchen", { exact: true }).fill(id);
  await expect(rowOf(page, area, id)).toBeVisible();

  // Ungültiger Status wird abgelehnt
  const areaId = { Server: "server", Switche: "switche", Storage: "storage", VMware: "vmware", TSPLUS: "tsplus", PRTG: "prtg", Veeam: "veeam", KEPware: "kepware", "Windows-Systeme": "windows" }[area];
  expect((await page.request.put(`/api/areas/${areaId}/${id}/status`, { data: { values: { status: "Erfunden" }, original: { status: "" } } })).status()).toBe(400);

});

test("Status: Grundrolle sieht die Liste, kann den Status aber nicht setzen", async ({ page }) => {
  await login(page, "user");
  await open(page);
  const row = table(page).locator("tbody tr").first();
  await expect(row).toBeVisible();
  await expect(table(page).getByRole("combobox")).toHaveCount(0);
  const id = (await row.locator("td").nth(1).textContent())!.trim();
  const area = (await row.locator("td").nth(0).textContent())!.trim();
  const areaId = { Server: "server", Switche: "switche", Storage: "storage", VMware: "vmware", TSPLUS: "tsplus", PRTG: "prtg", Veeam: "veeam", KEPware: "kepware", "Windows-Systeme": "windows" }[area];
  expect((await page.request.put(`/api/areas/${areaId}/${id}/status`, { data: { values: { status: "Angeboten" }, original: { status: "" } } })).status()).toBe(403);
});

test("Zurück aus einem System: Kunde, Status-Filter und Tabellensuche bleiben erhalten", async ({ page }) => {
  await login(page);
  await open(page);
  const t = table(page);
  const customers = page.getByRole("list", { name: "Kundenliste" }).getByRole("button");
  const name = (await customers.nth(1).getAttribute("title"))!;
  await customers.nth(1).click();
  await page.getByRole("group", { name: "Nach Status filtern" }).getByRole("button", { name: /^Ohne Status/ }).click();
  await expect(t).toHaveAccessibleName(`Offen · ${name} · Ohne Status`);
  const first = t.locator("tbody tr").first();
  const id = (await first.locator("td").nth(1).textContent())!.trim();
  await t.getByLabel("Suchen", { exact: true }).fill(id);

  // Markieren (erste Zelle, die Mitte kann die Status-Auswahl sein) und „Öffnen“; Doppelklick gibt es auf dem Handy nicht
  await t.locator("tbody tr").first().locator("td").first().click();
  await t.getByRole("button", { name: "Öffnen" }).click();
  await expect(page).toHaveURL(/\/bereich\/[a-z]+\/\d+$/);
  await page.getByRole("link", { name: "Zurück zu Auslaufende Kundensysteme" }).click();
  await expect(t).toHaveAccessibleName(`Offen · ${name} · Ohne Status`);
  await expect(page.getByRole("list", { name: "Kundenliste" }).getByRole("button", { name })).toHaveAttribute("aria-pressed", "true");
  await expect(t.getByLabel("Suchen", { exact: true })).toHaveValue(id);

  // Die geöffnete Zeile ist noch markiert: direkt wieder „Öffnen“, dann Browser-Zurück
  await t.getByRole("button", { name: "Öffnen" }).click();
  await expect(page).toHaveURL(/\/bereich\/[a-z]+\/\d+$/);
  await page.goBack();
  await expect(t).toHaveAccessibleName(`Offen · ${name} · Ohne Status`);
});

test("Breite Spalten machen die Seite nicht breiter: die Tabelle scrollt in sich", async ({ page }) => {
  await login(page);
  // Wie bei echten Daten mit langen Firmennamen: gemerkte Spaltenbreiten weit über die Fensterbreite
  await page.evaluate("localStorage.setItem('cmdb-spalten:Offen · Alle Kunden', JSON.stringify({ company: 700, name: 700 }))");
  await open(page);
  await expect(table(page).locator("tbody tr").first()).toBeVisible();
  const [scroll, client] = (await page.evaluate('[document.querySelector("main").scrollWidth, document.querySelector("main").clientWidth]')) as number[];
  expect(scroll).toBeLessThanOrEqual(client);
});

test("Spalten passen sich der Fensterbreite an: kein Scrollen nach rechts", async ({ page }) => {
  await page.setViewportSize({ width: 1600, height: 900 });
  await login(page);
  await open(page);
  const t = table(page);
  await expect(t.locator("tbody tr").first()).toBeVisible();
  const scroller = t.getByTestId("table-scroll");
  await expect.poll(() => scroller.evaluate((el) => el.scrollWidth - el.clientWidth)).toBeLessThanOrEqual(0);
});
