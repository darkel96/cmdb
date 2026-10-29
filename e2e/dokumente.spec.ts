import { expect, test, type Page } from "@playwright/test";

async function login(page: Page, username: "admin" | "user") {
  await page.goto("/login");
  await page.getByLabel("Benutzername").fill(username);
  await page.getByLabel("Passwort").fill("test");
  await page.getByRole("button", { name: "Anmelden" }).click();
  await expect(page.getByRole("heading", { name: "Kundenübersicht" })).toBeVisible();
}

test("Dokument direkt beim Kunden hochladen und wieder herunterladen", async ({ page }, testInfo) => {
  const name = `Vertrag ${testInfo.project.name}.pdf`;
  await login(page, "admin");
  await page.goto("/kunden/7");
  const box = page.getByRole("region", { name: "Dokumente" });
  await box.getByLabel("Dateien auswählen").setInputFiles({ name, mimeType: "application/pdf", buffer: Buffer.from("%PDF-1.4 erfundener Inhalt") });
  await expect(box.getByRole("status")).toHaveText(`„${name}“ wurde gespeichert.`);
  const link = box.getByRole("link", { name });
  await expect(link).toBeVisible();
  await expect(box).toContainText("Angebot");

  const download = page.waitForEvent("download");
  await link.click();
  const file = await download;
  expect(file.suggestedFilename()).toBe(name);

  // Pfadanteile im Namen werden entfernt, leere und zu grosse Dateien abgelehnt
  const res = await page.request.post("/api/customers/7/documents", { data: { name: "C:\\temp\\..\\notiz.txt", data: Buffer.from("x").toString("base64") } });
  expect(res.status()).toBe(201);
  const detail = await (await page.request.get("/api/customers/7")).json();
  expect(detail.documents.map((d: { name: string }) => d.name)).toContain("notiz.txt");
  expect((await page.request.post("/api/customers/7/documents", { data: { name: "leer.txt", data: "" } })).status()).toBe(400);
  expect((await page.request.post("/api/customers/99999/documents", { data: { name: "a.txt", data: "eA==" } })).status()).toBe(404);
});

test("Grundrolle sieht Dokumente, darf aber nicht hochladen", async ({ page }) => {
  await login(page, "user");
  await page.goto("/kunden/7");
  const box = page.getByRole("region", { name: "Dokumente" });
  await expect(box).toBeVisible();
  await expect(box.getByRole("button", { name: "Hochladen" })).toHaveCount(0);
  expect((await page.request.post("/api/customers/7/documents", { data: { name: "a.txt", data: "eA==" } })).status()).toBe(403);
});
