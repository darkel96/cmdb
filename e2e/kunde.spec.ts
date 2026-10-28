import { expect, test, type Page } from "@playwright/test";

async function login(page: Page) {
  await page.goto("/login");
  await page.getByLabel("Benutzername").fill("user");
  await page.getByLabel("Passwort").fill("test");
  await page.getByRole("button", { name: "Anmelden" }).click();
  await expect(page.getByRole("heading", { name: "Kundenübersicht" })).toBeVisible();
}

test("Kunde öffnen zeigt Kundeninformation und alle Systeme je Bereich", async ({ page }) => {
  await login(page);
  const first = page.getByRole("region", { name: "Kundenübersicht" }).locator("tbody tr").first();
  const name = (await first.locator("td").first().textContent())?.trim();
  await first.dblclick();

  await expect(page.getByTestId("customer-name")).toHaveText(name!);
  await expect(page.getByRole("heading", { name: "Kundeninformation" })).toBeVisible();
  await expect(page.getByRole("heading", { name: "Dokumente" })).toBeVisible();
  for (const title of ["Übersicht Server", "Übersicht Switche", "Übersicht MDEs", "Übersicht Oracle", "Übersicht Windows-Systeme"]) {
    await expect(page.getByRole("heading", { name: title, exact: true })).toBeVisible();
  }
  // Firma steht oben, nicht noch einmal in jeder Tabelle; 5/10/20 je Seite
  const server = page.getByRole("region", { name: "Übersicht Server" });
  await expect(server.getByRole("columnheader", { name: "Firma" })).toHaveCount(0);
  await expect(server.getByRole("group", { name: "Einträge je Seite" }).getByRole("button")).toHaveText(["5", "10", "20"]);

  await server.locator("tbody tr").first().dblclick();
  await expect(page.getByRole("heading", { name: /^Server \d+/ })).toBeVisible();
  // Zurück führt in die Kundenansicht, aus der der Server geöffnet wurde
  await page.getByRole("link", { name: `Zurück zu ${name}` }).click();
  await expect(page.getByTestId("customer-name")).toHaveText(name!);
});

test("Kundenansicht: Dokumente herunterladen, Oracle ohne Passwortspalte", async ({ page }) => {
  await login(page);
  const detail = await (await page.request.get("/api/customers/3")).json();
  expect(detail.documents).toHaveLength(1);
  const doc = await page.request.get(`/api/customers/3/documents/${detail.documents[0].id}`);
  expect(doc.status()).toBe(200);
  expect(doc.headers()["content-disposition"]).toContain("attachment");
  expect((await page.request.get("/api/customers/3/documents/99999")).status()).toBe(404);
  expect((await page.request.get("/api/customers/4/documents/31")).status()).toBe(404);

  const oracle = await (await page.request.get("/api/areas/oracle")).json();
  for (const row of oracle.items) for (const key of Object.keys(row)) expect(key.toLowerCase()).not.toMatch(/pw|pass/);
});
