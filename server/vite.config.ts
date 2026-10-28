/** Baut den CMDB-Dienst als eine Node-Datei (server/dist/index.mjs). Gemeinsamer Code (z. B. Testdaten) kommt aus src/lib. */
import { defineConfig } from "vite";
import { fileURLToPath, URL } from "node:url";
import { join } from "node:path";

const root = fileURLToPath(new URL("..", import.meta.url));

export default defineConfig({
  root,
  resolve: { alias: { "@": join(root, "src") } },
  build: {
    ssr: "server/src/index.ts",
    outDir: "server/dist",
    emptyOutDir: true,
    target: "node24",
    minify: false,
    sourcemap: true,
    rollupOptions: { output: { entryFileNames: "index.mjs", format: "es" } },
  },
  // ldapts und mssql bleiben externe Pakete (im Container unter node_modules), alles andere wird gebündelt
  ssr: { target: "node", external: ["ldapts", "mssql"] },
});
