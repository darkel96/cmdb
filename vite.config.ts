import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import tailwindcss from "@tailwindcss/vite";
import { fileURLToPath, URL } from "node:url";

// Modus "pages": GitHub Pages unter /cmdb/ (relative Pfade, Router über „#/…“, Testdaten im Browser, kein Server).
// Sonst liefert der CMDB-Dienst die Dateien unter „/“ aus; im Entwicklungsmodus leitet Vite /api an den Dienst weiter.
export default defineConfig(({ mode }) => ({
  base: mode === "pages" ? "./" : "/",
  plugins: [react(), tailwindcss()],
  resolve: { alias: { "@": fileURLToPath(new URL("./src", import.meta.url)) } },
  server: { proxy: { "/api": `http://localhost:${process.env.CMDB_PORT || 8790}` } },
}));
