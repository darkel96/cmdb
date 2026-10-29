import { expect, test, type Page } from "@playwright/test";

async function login(page: Page, username: "admin" | "user" = "user") {
  await page.goto("/login");
  await page.getByLabel("Benutzername").fill(username);
  await page.getByLabel("Passwort").fill("test");
  await page.getByRole("button", { name: "Anmelden" }).click();
  await expect(page.getByRole("heading", { name: "Kundenübersicht" })).toBeVisible();
}

const box = (page: Page) => page.getByRole("combobox", { name: "Globale Suche" });
const results = (page: Page) => page.getByRole("listbox", { name: "Suchergebnisse" });

test("Globale Suche: Servicetag finden, mit Enter öffnen; Strg+K springt ins Feld", async ({ page }) => {
  await login(page);
  const servers = (await (await page.request.get("/api/areas/server")).json()) as { items: { id: number; serviceTag: string }[] };
  const target = servers.items.find((r) => r.serviceTag)!;

  await page.locator("body").click();
  await page.keyboard.press("Control+k");
  await expect(box(page)).toBeFocused();
  await page.keyboard.type(target.serviceTag);
  const group = results(page).getByRole("group", { name: "Server" });
  await expect(group.getByRole("option").first()).toContainText(String(target.id));
  await expect(group.getByRole("option").first()).toContainText(`Servicetag: ${target.serviceTag}`);
  await page.keyboard.press("Enter");
  await expect(page).toHaveURL(new RegExp(`/bereich/server/${target.id}$`));
  await expect(box(page)).toHaveValue("");
});

test("Globale Suche: Kunden, „alle anzeigen“ und nichts gefunden", async ({ page }) => {
  await login(page);
  const customers = (await (await page.request.get("/api/customers")).json()) as { items: { id: number; name: string }[] };
  const customer = customers.items[0];

  await box(page).fill(customer.name);
  await results(page).getByRole("group", { name: "Kunden" }).getByRole("option", { name: new RegExp(customer.name) }).first().click();
  await expect(page).toHaveURL(new RegExp(`/kunden/${customer.id}$`));

  // Viele Treffer: Liste zeigt die ersten, „alle anzeigen“ öffnet den Bereich mit dem Suchbegriff
  await box(page).fill("Händler");
  const all = results(page).getByRole("option", { name: /^Alle \d+ in MDEs anzeigen$/ });
  await all.click();
  await expect(page).toHaveURL(/\/bereich\/mde\?suche=H%C3%A4ndler$/);
  await expect(page.getByLabel("Suchen", { exact: true })).toHaveValue("Händler");

  await box(page).fill("gibt-es-sicher-nicht-xyz");
  await expect(results(page)).toContainText("Nichts gefunden");
  await page.keyboard.press("Escape");
  await expect(box(page)).toHaveValue("");
});

test("Mehrere Wörter: jedes muss passen, ein Wort darf der Bereich sein", async ({ page }) => {
  await login(page);
  const oracle = (await (await page.request.get("/api/areas/oracle")).json()) as { items: { id: number; company: string }[] };
  const target = oracle.items.find((r) => r.company)!;
  const word = target.company.split(/\s+/)[0];

  await box(page).fill(`${word} oracle`);
  const group = results(page).getByRole("group", { name: "Oracle" });
  await expect(group.getByRole("option", { name: new RegExp(`^${target.id}\\b`) })).toBeVisible();
  // Andere Bereiche nur, wenn dort auch „oracle“ vorkommt; Server hat kein Feld mit „oracle“
  await expect(results(page).getByRole("group", { name: "Server" })).toHaveCount(0);
  for (const name of await group.getByRole("option").allTextContents()) expect(name.toLowerCase()).toContain(word.toLowerCase());
});

test("Suche ohne Anmeldung abgelehnt, Begriff zu lang abgelehnt", async ({ page }) => {
  expect((await page.request.get("/api/search?q=test")).status()).toBe(401);
  await login(page);
  expect((await page.request.get(`/api/search?q=${"x".repeat(101)}`)).status()).toBe(400);
  const short = (await (await page.request.get("/api/search?q=a")).json()) as { groups: unknown[] };
  expect(short.groups).toHaveLength(0);
});
