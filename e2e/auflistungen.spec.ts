import { expect, test, type Page } from "@playwright/test";

async function login(page: Page) {
  await page.goto("/login");
  await page.getByLabel("Benutzername").fill("admin");
  await page.getByLabel("Passwort").fill("test");
  await page.getByRole("button", { name: "Anmelden" }).click();
  await expect(page.getByRole("heading", { name: "Kundenübersicht" })).toBeVisible();
}

test("Auflistung Server: Anzahl je Servertyp, Klick öffnet die gefilterte Übersicht", async ({ page }) => {
  await login(page);
  await page.goto("/bereich/auflistungen");
  await page.getByRole("link", { name: /Aufstellung Server/ }).click();
  await expect(page.getByRole("heading", { name: "Aufstellung Server" })).toBeVisible();

  const bars = page.getByRole("list", { name: "Server je Servertyp" }).getByRole("button");
  await expect(bars.first()).toBeVisible();
  // Die Balken ergeben zusammen die Gesamtzahl
  const labels = await bars.evaluateAll((els) => els.map((e) => e.getAttribute("aria-label") ?? ""));
  const sum = labels.reduce((n, l) => n + Number(l.split(": ").pop()), 0);
  await expect(page.getByTestId("report-total")).toContainText(String(sum));

  const [type, count] = labels[0].split(": ");
  await bars.first().click();
  await expect(page).toHaveURL(/\/bereich\/server\?filter\.serverType=/);
  await expect(page.getByLabel("Filter Servertyp")).toHaveValue(`"${type}"`);
  await expect(page.getByTestId("table-status")).toContainText(`(${count} Elemente)`);
});

test("Auflistungen Oracle: Systeme nach DB-Typ und Versionen", async ({ page }) => {
  await login(page);
  await page.goto("/auflistungen/oracle-systeme");
  await expect(page.getByRole("list", { name: "Systeme je DB-Typ" }).getByRole("button").first()).toBeVisible();
  await page.goto("/auflistungen/oracle-versionen");
  const bars = page.getByRole("list", { name: "Systeme je DB-Version" }).getByRole("button");
  await expect(bars.first()).toBeVisible();
  await bars.first().click();
  await expect(page).toHaveURL(/\/bereich\/oracle\?filter\.dbVersion=/);
  // Kein Knopf „Passwort anzeigen“ wie in GAPTEQ
  await expect(page.getByRole("button", { name: /Passwort/ })).toHaveCount(0);
});

test("Auflistungen: Liste links, sortieren, Oracle-Versionen nach Hauptversion zusammenfassen", async ({ page }) => {
  await login(page);
  await page.goto("/bereich/auflistungen");
  const nav = page.getByRole("navigation", { name: "Auflistungen" });
  await expect(nav.getByRole("link")).toHaveText(["Aufstellung Oracle-Systeme", "Aufstellung Oracle-Versionen", "Aufstellung Server", "Auslaufende Kundensysteme"]);
  await nav.getByRole("link", { name: "Aufstellung Oracle-Versionen" }).click();
  const bars = page.getByRole("list", { name: "Systeme je DB-Version" }).getByRole("button");
  await expect(bars.first()).toBeVisible();
  const single = await bars.count();
  await page.getByLabel("Nach Hauptversion zusammenfassen").check();
  await expect.poll(() => bars.count()).toBeLessThan(single);
  // Summe bleibt gleich
  const sum = (await bars.evaluateAll((els) => els.map((e) => Number((e.getAttribute("aria-label") ?? "").split(": ").pop())))).reduce((a, b) => a + b, 0);
  await expect(page.getByTestId("report-total")).toContainText(String(sum));
  await page.getByRole("button", { name: "nach Anzahl" }).click();
  const counts = await bars.evaluateAll((els) => els.map((e) => Number((e.getAttribute("aria-label") ?? "").split(": ").pop())));
  expect(counts).toEqual([...counts].sort((a, b) => b - a));
  await bars.first().click();
  await expect(page).toHaveURL(/\/bereich\/oracle\?filter\.dbVersion=/);
});
