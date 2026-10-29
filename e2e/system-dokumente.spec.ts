import { expect, test, type Page } from "@playwright/test";

async function login(page: Page, username: "admin" | "user") {
  await page.goto("/login");
  await page.getByLabel("Benutzername").fill(username);
  await page.getByLabel("Passwort").fill("test");
  await page.getByRole("button", { name: "Anmelden" }).click();
  await expect(page.getByRole("heading", { name: "Kundenübersicht" })).toBeVisible();
}

test("Dokument an ein System hängen und herunterladen; Grundrolle nur lesen", async ({ page, browser }, testInfo) => {
  const name = `Lieferschein ${testInfo.project.name}.pdf`;
  // Eigenes System je Lauf (Desktop/Mobil teilen sich den Testdienst)
  const id = testInfo.project.name === "mobil" ? 60002 : 60001;
  await login(page, "admin");
  await page.goto(`/bereich/prtg/${id}`);
  const box = page.getByRole("region", { name: "Dokumente" });
  await expect(box).toContainText("Keine Dateien");
  await box.getByLabel("Dateien auswählen").setInputFiles({ name, mimeType: "application/pdf", buffer: Buffer.from("%PDF-1.4 erfunden") });
  await expect(box.getByRole("status")).toHaveText(`„${name}“ wurde gespeichert.`);
  const download = page.waitForEvent("download");
  await box.getByRole("link", { name }).click();
  expect((await download).suggestedFilename()).toBe(name);

  const user = await browser.newPage();
  await login(user, "user");
  await user.goto(`/bereich/prtg/${id}`);
  await expect(user.getByRole("region", { name: "Dokumente" }).getByRole("link", { name })).toBeVisible();
  await expect(user.getByRole("button", { name: "Hochladen" })).toHaveCount(0);
  expect((await user.request.post(`/api/areas/prtg/${id}/documents`, { data: { name: "a.txt", data: "eA==" } })).status()).toBe(403);
  await user.close();
});
