import { expect, test, type Page } from "@playwright/test";

async function login(page: Page) {
  await page.goto("/login");
  await page.getByLabel("Benutzername").fill("admin");
  await page.getByLabel("Passwort").fill("test");
  await page.getByRole("button", { name: "Anmelden" }).click();
  await expect(page.getByRole("heading", { name: "Kundenübersicht" })).toBeVisible();
}

test("Auslaufende Kundensysteme: nur Support bis Ende des dritten Monats, EOL rot, Bereiche ausblendbar", async ({ page }) => {
  await login(page);
  await page.goto("/bereich/auflistungen");
  await page.getByRole("link", { name: /Auslaufende Kundensysteme/ }).click();
  await expect(page.getByRole("heading", { name: "Auslaufende Kundensysteme" })).toBeVisible();

  const server = page.getByRole("region", { name: "Server", exact: true });
  await expect(server.getByRole("row").nth(2)).toBeVisible();
  // Alle gezeigten Daten liegen vor dem ersten Tag des vierten Monats ab jetzt
  const now = new Date();
  const cutoff = new Date(now.getFullYear(), now.getMonth() + 4, 1);
  await server.getByRole("button", { name: "20" }).click();
  const header = (await server.locator("thead tr").first().locator("th").allTextContents()).map((t) => t.trim());
  const col = header.findIndex((t) => t.startsWith("Support bis"));
  const eolCol = header.findIndex((t) => t.startsWith("EOL"));
  const rows = server.locator("tbody tr");
  const n = await rows.count();
  expect(n).toBeGreaterThan(0);
  for (let i = 0; i < n; i++) {
    const cells = rows.nth(i).locator("td");
    const [d, m, y] = (await cells.nth(col).textContent())!.split(".").map(Number);
    expect(new Date(2000 + y, m - 1, d).getTime()).toBeLessThan(cutoff.getTime());
    const eol = (await cells.nth(eolCol).textContent())?.trim();
    if (eol === "Ja") await expect(rows.nth(i)).toHaveAttribute("data-highlight", "true");
    else await expect(rows.nth(i)).not.toHaveAttribute("data-highlight");
  }

  // Ausblenden und wieder einblenden
  const toggles = page.getByRole("group", { name: "Bereiche ein- und ausblenden" });
  await toggles.getByRole("button", { name: /^Server/ }).click();
  await expect(server).toHaveCount(0);
  await toggles.getByRole("button", { name: "Alles ausblenden" }).click();
  await expect(page.getByRole("region", { name: "Switche", exact: true })).toHaveCount(0);
  await toggles.getByRole("button", { name: "Alles einblenden" }).click();
  await expect(server).toBeVisible();
  await expect(page.getByRole("region", { name: "Windows-Systeme", exact: true }).getByRole("columnheader", { name: /Support bis/ })).toBeVisible();
});
