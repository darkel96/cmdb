import { expect, test, type Page } from "@playwright/test";

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

test("Auslaufende Kundensysteme: eine Tabelle, nur Support bis Ende des dritten Monats, EOL rot, Kunde filtert", async ({ page }) => {
  await login(page);
  await open(page);
  const t = table(page);
  await expect(t).toHaveAccessibleName("Offen · Alle Kunden");
  await t.getByRole("button", { name: "100", exact: true }).click();
  const header = (await t.locator("thead tr").first().locator("th").allTextContents()).map((h) => h.trim());
  const col = (name: string) => header.findIndex((h) => h.startsWith(name));
  const cutoff = (() => {
    const now = new Date();
    return new Date(now.getFullYear(), now.getMonth() + 4, 1).getTime();
  })();
  const rows = t.locator("tbody tr");
  const n = await rows.count();
  expect(n).toBeGreaterThan(5);
  for (let i = 0; i < n; i++) {
    const cells = rows.nth(i).locator("td");
    const [d, m, y] = (await cells.nth(col("Support bis")).textContent())!.split(".").map(Number);
    expect(new Date(2000 + y, m - 1, d).getTime()).toBeLessThan(cutoff);
    expect(["Verlängert", "Abgeschlossen"]).not.toContain((await cells.nth(col("Status")).textContent())?.trim());
    if ((await cells.nth(col("EOL")).textContent())?.trim() === "Ja") await expect(rows.nth(i)).toHaveAttribute("data-highlight", "true");
    else await expect(rows.nth(i)).not.toHaveAttribute("data-highlight");
  }
  // Mehrere Bereiche in derselben Tabelle
  const areas = new Set(await rows.locator(`td:nth-child(${col("Bereich") + 1})`).allTextContents());
  expect(areas.size).toBeGreaterThan(2);

  // Kunde wählen filtert
  const first = page.getByRole("list", { name: "Kundenliste" }).getByRole("button").nth(1);
  const name = (await first.getAttribute("title"))!;
  await first.click();
  await expect(t).toHaveAccessibleName(`Offen · ${name}`);
  for (const c of await t.locator(`tbody td:nth-child(${col("Firma") + 1})`).allTextContents()) expect(c.trim()).toBe(name);

  // Bereich ausblenden
  await page.getByRole("button", { name: "Alle Kunden" }).click();
  const chip = page.getByRole("group", { name: "Bereiche ein- und ausblenden" }).getByRole("button", { name: /^Server/ });
  await chip.click();
  await expect(chip).toHaveAttribute("aria-pressed", "false");
  await expect(t.locator(`tbody td:nth-child(${col("Bereich") + 1})`, { hasText: /^Server$/ })).toHaveCount(0);
});

test("Status in der Zeile: Verlängert verschiebt ins Archiv, zurück auf offen holt es wieder", async ({ page, browser }) => {
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
  await t.getByRole("button", { name: "100", exact: true }).click();
  const archived = rowOf(page, area, id);
  await expect(archived).toContainText("Verlängert");
  await archived.getByRole("combobox").click();
  await page.getByRole("option", { name: "– keine Auswahl –" }).click();
  await expect(rowOf(page, area, id)).toHaveCount(0);
  await page.getByRole("tab", { name: /Offen/ }).click();
  await t.getByRole("button", { name: "100", exact: true }).click();
  await expect(rowOf(page, area, id)).toBeVisible();

  // Ungültiger Status wird abgelehnt
  const areaId = { Server: "server", Switche: "switche", Storage: "storage", VMware: "vmware", TSPLUS: "tsplus", PRTG: "prtg", Veeam: "veeam", KEPware: "kepware", "Windows-Systeme": "windows" }[area];
  expect((await page.request.put(`/api/areas/${areaId}/${id}`, { data: { values: { status: "Erfunden" }, original: { status: "" } } })).status()).toBe(400);

  // Grundrolle: lesen ja, Status setzen nein
  const user = await browser.newPage();
  await login(user, "user");
  await open(user);
  await expect(table(user).locator("tbody tr").first()).toBeVisible();
  await expect(table(user).getByRole("combobox")).toHaveCount(0);
  expect((await user.request.put(`/api/areas/${areaId}/${id}`, { data: { values: { status: "Angeboten" }, original: { status: "" } } })).status()).toBe(403);
  await user.close();
});
