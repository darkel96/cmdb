import { expect, test, type Page } from "@playwright/test";

async function openArea(page: Page, link: string, heading: string) {
  await page.goto("/login");
  await page.getByLabel("Benutzername").fill("user");
  await page.getByLabel("Passwort").fill("test");
  await page.getByRole("button", { name: "Anmelden" }).click();
  await expect(page.getByRole("heading", { name: "Kundenübersicht" })).toBeVisible();
  const toggle = page.getByRole("button", { name: "Menü ein- oder ausblenden" });
  if ((await toggle.isVisible()) && (await toggle.getAttribute("aria-expanded")) === "false") await toggle.click();
  const nav = page.getByRole("navigation", { name: "Hauptnavigation" }).locator("visible=true");
  await nav.getByRole("button", { name: "Hardware" }).click();
  await nav.getByRole("link", { name: link, exact: true }).click();
  await expect(page.getByRole("heading", { name: heading })).toBeVisible();
}

const openServers = (page: Page) => openArea(page, "Server", "Übersicht Server");

test("Übersicht Server: Spalten wie in GAPTEQ, Öffnen der markierten Zeile", async ({ page }) => {
  await openServers(page);
  const table = page.getByRole("region", { name: "Übersicht Server" });
  for (const label of ["ID", "Firma", "Lieferant", "Lieferdatum", "Bestellnummer", "Hersteller", "Modell", "Servertyp", "Servicetag", "Wartungstyp", "Support bis", "EOL", "Besonderheiten"]) {
    await expect(table.getByRole("columnheader", { name: label, exact: true })).toHaveCount(1);
  }
  // 24 erfundene Server, dazu ggf. die im Test „Anlage“ angelegten (der Dienst behält sie bis zum Neustart)
  await expect(page.getByTestId("table-status")).toHaveText(/^Seite 1 von 1 \((2[4-9]) Elemente\)$/);

  const open = page.getByRole("button", { name: "Öffnen" });
  await expect(open).toBeDisabled();
  await table.locator("tbody tr").nth(1).click();
  await expect(open).toBeEnabled();
  await open.click();
  await expect(page.getByRole("heading", { name: /^Server 10001/ })).toBeVisible();
  await expect(page.getByText("Nur lesend.")).toBeVisible();

  await page.getByRole("link", { name: "Zurück zur Übersicht Server" }).click();
  await expect(page.getByRole("heading", { name: "Übersicht Server" })).toBeVisible();
});

test("Übersicht Server: Doppelklick öffnet, Datum sortiert chronologisch", async ({ page }) => {
  await openServers(page);
  const table = page.getByRole("region", { name: "Übersicht Server" });
  await table.getByRole("button", { name: "Support bis" }).click();
  const dates = await table.locator("tbody tr td:nth-child(11)").allTextContents();
  const iso = dates.map((d) => { const [dd, mm, yy] = d.split("."); return `20${yy}-${mm}-${dd}`; });
  expect(iso).toEqual([...iso].sort());

  await table.locator("tbody tr").first().dblclick();
  await expect(page.getByRole("heading", { name: /^Server \d+/ })).toBeVisible();
});

test("Übersicht Switche: Spalten wie in GAPTEQ, Öffnen zeigt alle Felder", async ({ page }) => {
  await openArea(page, "Switche", "Übersicht Switche");
  const table = page.getByRole("region", { name: "Übersicht Switche" });
  const headers = await table.getByRole("columnheader").allTextContents();
  expect(headers.slice(0, 10).map((h) => h.trim())).toEqual(["ID", "Firma", "Lieferant", "Bestellnummer", "Support bis", "Hersteller", "Modell", "LWL-Typ", "Servicetag", "Besonderheiten"]);
  // 18 erfundene Switche, dazu ggf. der im Test „Anlage Switch“ angelegte
  await expect(page.getByTestId("table-status")).toHaveText(/^Seite 1 von 1 \((1[89]|2[0-9]) Elemente\)$/);

  await table.locator("tbody tr").first().dblclick();
  await expect(page.getByRole("heading", { name: /^Switch 20000/ })).toBeVisible();
  for (const label of ["Typ", "EOL", "Status", "LWL-Typ"]) await expect(page.getByText(label, { exact: true })).toBeVisible();
});

test("Seitenleiste Hardware in der Reihenfolge wie GAPTEQ", async ({ page }) => {
  await openServers(page);
  const toggle = page.getByRole("button", { name: "Menü ein- oder ausblenden" });
  if ((await toggle.isVisible()) && (await toggle.getAttribute("aria-expanded")) === "false") await toggle.click();
  const nav = page.getByRole("navigation", { name: "Hauptnavigation" }).locator("visible=true");
  const items = nav.getByRole("button", { name: "Hardware" }).locator("xpath=..").getByRole("link");
  await expect(items).toHaveText(["Server", "Switche", "MDE", "Storage", "Client"]);
});

test("Software- und Lizenzbereiche: Spalten wie in GAPTEQ", async ({ page }) => {
  await openArea(page, "Server", "Übersicht Server");
  const expected: Record<string, string[]> = {
    vmware: ["ID", "Firma", "Lieferant", "Bestellnummer", "Lizenztyp", "Lizenznehmer", "Lizenz", "Support bis", "Besonderheiten"],
    tsplus: ["ID", "Firma", "Lieferant", "Bestellnummer", "Lizenztyp", "Lizenz", "Anzahl Lizenzen", "Support bis", "Besonderheiten"],
    prtg: ["ID", "Firma", "Lieferant", "Lieferdatum", "Bestellnummer", "Anzahl Sensoren", "Support bis", "EOL", "Besonderheiten"],
    windows: ["ID", "Typ", "Firma", "Funktion", "Hostname", "IP", "Subnetz", "Gateway", "OS", "WinCC", "Hardware", "Bereitgestellt", "EOL", "Besonderheiten"],
    "oracle-esl": ["ID", "Kunde", "SAP-Projektnummer", "Oracle-Rahmenvertrag", "Oracle Ende Projektsupport", "Oracle-Lizenzmeldung", "Lizenzmeldung Datum", "CSI-Nummer"],
  };
  for (const [id, headers] of Object.entries(expected)) {
    await page.goto(`/bereich/${id}`);
    const table = page.locator("section").filter({ has: page.getByRole("heading", { name: /^Übersicht / }) }).first();
    await expect(table.getByRole("columnheader").first()).toBeVisible();
    const actual = (await table.getByRole("columnheader").allTextContents()).map((h) => h.trim()).slice(0, headers.length);
    expect(actual, id).toEqual(headers);
  }
});
