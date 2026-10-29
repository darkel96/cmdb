/**
 * CMDB-Dienst: API unter /api und, wenn CMDB_STATIC gesetzt ist, das gebaute Frontend.
 * Start: `node server/dist/index.mjs`, Einstellungen über die Umgebung (server/.env.example).
 */
import { createServer as createHttpServer, type IncomingMessage, type ServerResponse } from "node:http";
import { createServer as createHttpsServer } from "node:https";
import { readFileSync } from "node:fs";
import { readFile, stat } from "node:fs/promises";
import { extname, join, resolve, sep } from "node:path";
import { initAdminStore } from "./admin";
import { api, json } from "./api";
import { ENV, checkEnv } from "./env";
import { settings } from "./settings";
import { log } from "./log";

const MIME: Record<string, string> = {
  ".html": "text/html; charset=utf-8", ".js": "text/javascript", ".mjs": "text/javascript", ".css": "text/css",
  ".json": "application/json", ".svg": "image/svg+xml", ".png": "image/png", ".ico": "image/x-icon",
  ".woff2": "font/woff2", ".woff": "font/woff", ".txt": "text/plain; charset=utf-8", ".map": "application/json",
};

const SECURITY_HEADERS: Record<string, string> = {
  "X-Content-Type-Options": "nosniff",
  "X-Frame-Options": "DENY",
  "Referrer-Policy": "same-origin",
  "Content-Security-Policy": "default-src 'self'; img-src 'self' data:; style-src 'self' 'unsafe-inline'; frame-ancestors 'none'; base-uri 'self'; form-action 'self'",
};

/** Gebautes Frontend aus CMDB_STATIC; Pfade ohne Endung liefern index.html (Browser-Router) */
async function serveStatic(path: string, res: ServerResponse): Promise<boolean> {
  if (!ENV.staticDir) return false;
  const root = resolve(ENV.staticDir);
  let rel: string;
  try {
    rel = decodeURIComponent(path);
  } catch {
    return false;
  }
  if (rel === "/") rel = "/index.html";
  const file = resolve(join(root, rel));
  if (!file.startsWith(root + sep)) return false;
  try {
    if (!(await stat(file)).isFile()) throw new Error("kein File");
    const immutable = rel.startsWith("/assets/");
    res.writeHead(200, { "Content-Type": MIME[extname(file)] ?? "application/octet-stream", "Cache-Control": immutable ? "public, max-age=31536000, immutable" : "no-cache" });
    res.end(await readFile(file));
    return true;
  } catch {
    if (extname(rel)) return false;
    res.writeHead(200, { "Content-Type": MIME[".html"], "Cache-Control": "no-cache" });
    res.end(await readFile(join(root, "index.html")));
    return true;
  }
}

async function handle(req: IncomingMessage, res: ServerResponse): Promise<void> {
  for (const [k, v] of Object.entries(SECURITY_HEADERS)) res.setHeader(k, v);
  const path = new URL(req.url ?? "/", "http://localhost").pathname;
  try {
    if (await api(req, res, path)) return;
    if ((req.method === "GET" || req.method === "HEAD") && (await serveStatic(path, res))) return;
    json(res, 404, { error: "Nicht gefunden." });
  } catch (e) {
    log(`Fehler bei ${req.method} ${path}: ${e instanceof Error ? e.message : String(e)}`);
    if (!res.headersSent) json(res, 500, { error: "Interner Fehler." });
    else res.end();
  }
}

const errors = checkEnv();
if (errors.length) {
  for (const e of errors) console.error(`Konfiguration: ${e}`);
  process.exit(1);
}

const tls = Boolean(ENV.tlsCert);
const listener = (req: IncomingMessage, res: ServerResponse) => void handle(req, res);
const server = tls
  ? createHttpsServer({ cert: readFileSync(ENV.tlsCert), key: readFileSync(ENV.tlsKey), minVersion: "TLSv1.2" }, listener)
  : createHttpServer(listener);

// Schema cmdb (Anmelde-Protokoll, Rollen) im Hintergrund einrichten; die Anmeldung geht auch ohne
void initAdminStore();

server.listen(ENV.port, () => {
  log(`CMDB-Dienst ${ENV.version} auf Port ${ENV.port} (${tls ? "HTTPS" : "HTTP"})${ENV.testMode ? " im TESTMODUS (Testbenutzer, erfundene Daten)" : ""}`);
  if (!ENV.testMode) log(`LDAP: ${settings("ldap").url}, Basis ${settings("ldap").baseDn}; Datenbank: ${settings("db").server || "(nicht eingerichtet)"}`);
  if (!ENV.testMode && !tls && !ENV.trustProxy && !ENV.allowInsecureHttp) log("Hinweis: Ohne HTTPS (CMDB_TLS_CERT) oder Proxy (CMDB_TRUST_PROXY) ist die Anmeldung gesperrt.");
});

for (const signal of ["SIGINT", "SIGTERM"] as const) {
  process.on(signal, () => {
    log(`${signal} erhalten, Dienst wird beendet`);
    server.close(() => process.exit(0));
    setTimeout(() => process.exit(0), 3000).unref();
  });
}
