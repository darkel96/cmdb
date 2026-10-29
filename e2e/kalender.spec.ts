import { expect, test, type Page } from "@playwright/test";

async function login(page: Page) {
  await page.goto("/login");
  await page.getByLabel("Benutzername").fill("admin");
  await page.getByLabel("Passwort").fill("test");
  await page.getByRole("button", { name: "Anmelden" }).click();
  await expect(page.getByRole("heading", { name: "Kundenübersicht" })).toBeVisible();
}

test("Datumsfeld: Klick ins Feld öffnet den Kalender, Tag wählen, tippen, Heute, Löschen", async ({ page }) => {
  await login(page);
  await page.goto("/bereich/server/neu");
  const field = page.getByLabel("Support bis");
  await field.click();
  const cal = page.getByRole("dialog", { name: "Kalender" });
  await expect(cal).toBeVisible();
  await expect(cal.getByText("Mo", { exact: true })).toBeVisible();

  // Monat weiter, den 15. wählen
  const now = new Date();
  const next = new Date(now.getFullYear(), now.getMonth() + 1, 15);
  const de = `15.${String(next.getMonth() + 1).padStart(2, "0")}.${next.getFullYear()}`;
  await cal.getByRole("button", { name: "Ein Monat weiter" }).click();
  await cal.getByRole("button", { name: de, exact: true }).click();
  await expect(cal).toHaveCount(0);
  await expect(field).toHaveValue(de);

  // Tippen in deutscher Schreibweise, kurz und lang
  await field.fill("1.2.27");
  await field.press("Enter");
  await expect(field).toHaveValue("01.02.2027");
  await field.fill("31.02.2027");
  await field.blur();
  await expect(field).toHaveAttribute("aria-invalid", "true");

  // Heute und Löschen
  await field.click();
  await page.getByRole("dialog", { name: "Kalender" }).getByRole("button", { name: "Heute" }).click();
  const today = `${String(now.getDate()).padStart(2, "0")}.${String(now.getMonth() + 1).padStart(2, "0")}.${now.getFullYear()}`;
  await expect(field).toHaveValue(today);
  await field.click();
  await page.getByRole("dialog", { name: "Kalender" }).getByRole("button", { name: "Löschen" }).click();
  await expect(field).toHaveValue("");
});
