import { expect, test, type Page } from "@playwright/test";

async function login(page: Page) {
  await page.goto("/login");
  await page.getByLabel("Benutzername").fill("admin");
  await page.getByLabel("Passwort").fill("test");
  await page.getByRole("button", { name: "Anmelden" }).click();
  await expect(page.getByRole("heading", { name: "Kundenübersicht" })).toBeVisible();
}

test("Server-OS: LTS-Ende pflegen; Windows-System ohne eigenes Datum übernimmt es, abgelaufen = EOL", async ({ page }) => {
  await login(page);
  await page.goto("/verwaltung?tab=stammdaten");
  await page.getByRole("navigation", { name: "Auswahllisten" }).getByRole("button", { name: /^Server-OS/ }).click();
  const panel = page.getByRole("region", { name: "Server-OS", exact: true });
  const row = panel.getByRole("listitem").filter({ hasText: "Windows Server 2019" });
  await expect(row).toContainText("LTS bis 09.01.2029");

  // LTS-Ende in die Vergangenheit setzen
  await row.getByRole("button", { name: "Support-Ende Windows Server 2019 bearbeiten" }).click();
  await row.getByLabel("allgemein bis").fill("2019-01-01");
  await row.getByLabel("LTS bis").fill("2020-01-01");
  await row.getByRole("button", { name: "Übernehmen" }).click();
  await expect(row).toContainText("LTS bis 01.01.2020 · abgelaufen");

  try {
    // Neues Windows-System ohne „Support bis“: Datum und EOL kommen aus dem Betriebssystem
    const form = await (await page.request.get("/api/areas/windows/form")).json();
    const values: Record<string, string> = { os: "Windows Server 2019", hostname: "win-demo-os" };
    for (const [key, options] of Object.entries(form.options as Record<string, string[]>)) values[key] ??= options[0];
    const res = await page.request.post("/api/areas/windows", { data: { values } });
    expect(res.status(), await res.text()).toBe(201);
    const { id } = await res.json();
    const created = await (await page.request.get(`/api/areas/windows/${id}`)).json();
    expect(created).toMatchObject({ supportUntil: "2020-01-01", supportSource: "Server-OS", eol: "Ja", eolSource: "Server-OS" });
    await page.goto(`/bereich/windows/${id}`);
    await expect(page.getByText("aus Server-OS").first()).toBeVisible();
  } finally {
    // Zurück auf die Vorbelegung (der Testdienst gilt für alle Tests)
    await page.request.put("/api/os-support", { data: { name: "Windows Server 2019", mainstreamEnd: "2024-01-09", extendedEnd: "2029-01-09" } });
  }
});
