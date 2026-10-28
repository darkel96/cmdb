import { expect, test, type Page } from "@playwright/test";

async function login(page: Page, username: "admin" | "user") {
  await page.goto("/login");
  await page.getByLabel("Benutzername").fill(username);
  await page.getByLabel("Passwort").fill("test");
  await page.getByRole("button", { name: "Anmelden" }).click();
  await expect(page.getByRole("heading", { name: "Kundenübersicht" })).toBeVisible();
}

test("user darf nicht anlegen", async ({ page }) => {
  await login(page, "user");
  await page.goto("/bereich/server");
  await expect(page.getByRole("heading", { name: "Übersicht Server" })).toBeVisible();
  await expect(page.getByRole("link", { name: "Anlegen" })).toHaveCount(0);
  await page.goto("/bereich/server/neu");
  await expect(page.getByRole("heading", { name: "Kundenübersicht" })).toBeVisible();
  const res = await page.request.post("/api/areas/server", { data: { values: { company: "x" } } });
  expect(res.status()).toBe(403);
});

test("admin legt über Anlage Vertrag einen Server an", async ({ page }) => {
  await login(page, "admin");
  await page.getByRole("link", { name: "Verwaltung" }).click();
  await page.getByRole("link", { name: "Anlage Vertrag" }).click();
  await expect(page.getByRole("heading", { name: "Anlage Vertrag" })).toBeVisible();
  await expect(page.getByRole("region", { name: "Anlage Vertrag" }).locator("[aria-disabled=true]", { hasText: "MDEs" })).toContainText("folgt");
  await page.getByRole("region", { name: "Anlage Vertrag" }).getByRole("link", { name: "Server", exact: true }).click();

  await expect(page.getByRole("heading", { name: "Anlage Server" })).toBeVisible();
  const nextId = (await page.getByTestId("next-id").textContent())?.trim();
  expect(nextId).toMatch(/^\d+$/);
  await expect(page.getByLabel("EOL")).toHaveValue("Nein");
  // Hand über Auswahllisten und dem Kalendersymbol der Datumsfelder
  await expect(page.getByLabel("Hersteller")).toHaveCSS("cursor", "pointer");
  // Den Zeiger über dem Kalendersymbol meldet der Browser nicht; geprüft wird die Regel im Stylesheet
  expect(await page.evaluate("[...document.styleSheets].flatMap((s) => [...s.cssRules]).some((r) => r.cssText.includes('calendar-picker-indicator') && r.cssText.includes('cursor: pointer'))")).toBe(true);

  // Pflichtfelder leer: nicht gespeichert, Felder markiert
  await page.getByRole("button", { name: "Speichern" }).click();
  await expect(page.getByRole("alert")).toHaveText("Bitte alle Pflichtfelder (*) ausfüllen.");
  for (const label of ["Firma", "Hersteller", "Modell", "Servertyp"]) await expect(page.getByLabel(label)).toHaveAttribute("aria-invalid", "true");

  await page.getByLabel("Firma").selectOption({ index: 1 });
  await page.getByLabel("Hersteller").selectOption("Hersteller B");
  await page.getByLabel("Modell").fill("Rack Test 1U");
  await page.getByLabel("Servertyp").selectOption("Single Server");
  await page.getByLabel("Support bis").fill("2030-12-31");
  await page.getByLabel("Besonderheiten").fill("Angelegt im Test");
  await page.getByRole("button", { name: "Speichern" }).click();

  await expect(page.locator("main").getByRole("status")).toHaveText(`Server ${nextId} wurde angelegt.`);
  await expect(page.getByRole("heading", { name: new RegExp(`^Server ${nextId}`) })).toBeVisible();
  await expect(page.getByText("Rack Test 1U")).toBeVisible();
  await expect(page.getByText("31.12.2030")).toBeVisible();
});

test("API prüft Pflichtfelder und Auswahllisten", async ({ page }) => {
  await login(page, "admin");
  const missing = await page.request.post("/api/areas/server", { data: { values: { company: "Beispiel A AG" } } });
  expect(missing.status()).toBe(400);
  expect((await missing.json()).error).toBe("Hersteller ist ein Pflichtfeld.");
  const notInList = await page.request.post("/api/areas/server", {
    data: { values: { company: "Gibt es nicht GmbH", manufacturer: "Hersteller A", model: "X", serverType: "Single Server" } },
  });
  expect(notInList.status()).toBe(400);
  expect((await notInList.json()).error).toContain("steht nicht in der Auswahlliste");
  const switches = await page.request.post("/api/areas/switche", { data: { values: {} } });
  expect(switches.status()).toBe(404);
});
