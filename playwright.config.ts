import { defineConfig } from "@playwright/test";

const PORT = 8798;

export default defineConfig({
  testDir: "./e2e",
  outputDir: "./test-results",
  timeout: 30_000,
  retries: 0,
  // Die Tests teilen sich einen Dienst (Sperre nach Fehlversuchen zählt je Adresse), daher nacheinander
  workers: 1,
  reporter: [["list"]],
  use: { baseURL: `http://localhost:${PORT}`, trace: "retain-on-failure", locale: "de-DE" },
  webServer: {
    // Dienst im Testmodus liefert das gebaute Frontend aus: derselbe Weg wie im Container
    command: `npm run build && npm run build:server && CMDB_TESTMODE=1 CMDB_STATIC=dist CMDB_PORT=${PORT} node server/dist/index.mjs`,
    url: `http://localhost:${PORT}/api/health`,
    reuseExistingServer: false,
    timeout: 180_000,
  },
  projects: [
    { name: "desktop", use: { browserName: "chromium", viewport: { width: 1280, height: 800 } } },
    { name: "mobil", use: { browserName: "chromium", viewport: { width: 390, height: 844 } } },
  ],
});
