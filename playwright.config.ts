import { defineConfig } from "@playwright/test";

const PORT = 8798;
// Gegen einen laufenden Dienst im Testmodus prüfen, z. B. cmdb-dev:  CMDB_E2E_URL=https://localhost:8790 npm run test:e2e
const LIVE_URL = process.env.CMDB_E2E_URL;

export default defineConfig({
  testDir: "./e2e",
  outputDir: "./test-results",
  timeout: 30_000,
  retries: 0,
  // Die Tests teilen sich einen Dienst (Sperre nach Fehlversuchen zählt je Adresse), daher nacheinander
  workers: 1,
  reporter: [["list"]],
  use: { baseURL: LIVE_URL || `http://localhost:${PORT}`, ignoreHTTPSErrors: Boolean(LIVE_URL), trace: "retain-on-failure", locale: "de-DE" },
  webServer: LIVE_URL ? undefined : {
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
