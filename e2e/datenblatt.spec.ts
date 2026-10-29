import { expect, test, type Page } from "@playwright/test";

async function login(page: Page) {
  await page.goto("/login");
  await page.getByLabel("Benutzername").fill("user");
  await page.getByLabel("Passwort").fill("test");
  await page.getByRole("button", { name: "Anmelden" }).click();
  await expect(page.getByRole("heading", { name: "Kundenübersicht" })).toBeVisible();
}

test("Kundendatenblatt: aus der Kundenansicht, Kundendaten, Kennzahlen, Systeme je Bereich, Druck ohne Kopf- und Seitenleiste", async ({ page }) => {
  await login(page);
  // Kunde mit Systemen: der von Server 10000
  const company = (await (await page.request.get("/api/areas/server/10000")).json()).company;
  const customer = (await (await page.request.get("/api/customers")).json()).items.find((c: { name: string }) => c.name === company);
  await page.goto(`/kunden/${customer.id}`);
  const name = (await page.getByTestId("customer-name").textContent())!.trim();
  await page.getByRole("link", { name: "Datenblatt (PDF)" }).click();
  await expect(page).toHaveURL(new RegExp(`/kunden/${customer.id}/datenblatt$`));
  const sheet = page.getByRole("article", { name: "Kundendatenblatt" });
  await expect(sheet.getByRole("heading", { name: "Kundendatenblatt" })).toBeVisible();
  await expect(sheet.getByTestId("sheet-customer")).toHaveText(name);
  await expect(sheet.getByRole("region", { name: "Kennzahlen" })).toContainText("Systeme");
  await expect(sheet.getByRole("region", { name: "Server" })).toContainText("10000");
  await expect(page.getByRole("button", { name: "Drucken / als PDF speichern" })).toBeVisible();

  // Druckansicht: Kopfleiste, Seitenleiste und Knöpfe weg
  await page.emulateMedia({ media: "print" });
  await expect(page.locator("header").first()).toBeHidden();
  await expect(page.getByTestId("sidebar")).toBeHidden();
  await expect(page.getByRole("button", { name: "Drucken / als PDF speichern" })).toBeHidden();
  await expect(sheet).toBeVisible();
});
