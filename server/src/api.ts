/** API des CMDB-Dienstes unter /api */
import type { IncomingMessage, ServerResponse } from "node:http";
import type { CiListResponse, CustomerListResponse, HealthResponse, MeResponse, SessionUser } from "@/lib/types";
import { TEST_CIS, TEST_CUSTOMERS, TEST_PASSWORD, TEST_USERS } from "@/lib/testData";
import { DbError, dbCheck, listCustomers } from "./db";
import { ENV } from "./env";
import { LoginError, ldapCheck, ldapLogin, normalizeUsername } from "./ldap";
import { log } from "./log";
import { lockedFor, recordFailure, recordSuccess } from "./rateLimit";
import { clearSessionCookie, sessionFromRequest, setSessionCookie } from "./session";

const MAX_BODY = 16 * 1024;
const startedAt = Date.now();

export function isSecure(req: IncomingMessage): boolean {
  if ((req.socket as { encrypted?: boolean }).encrypted) return true;
  return ENV.trustProxy && String(req.headers["x-forwarded-proto"] ?? "").split(",")[0].trim() === "https";
}

export function clientAddress(req: IncomingMessage): string {
  if (ENV.trustProxy) {
    const forwarded = String(req.headers["x-forwarded-for"] ?? "").split(",")[0].trim();
    if (forwarded) return forwarded;
  }
  return req.socket.remoteAddress ?? "unbekannt";
}

export function json(res: ServerResponse, status: number, body: unknown): void {
  res.writeHead(status, { "Content-Type": "application/json; charset=utf-8", "Cache-Control": "no-store" });
  res.end(JSON.stringify(body));
}

function fail(res: ServerResponse, status: number, message: string): void {
  json(res, status, { error: message });
}

async function readJson(req: IncomingMessage): Promise<Record<string, unknown>> {
  const chunks: Buffer[] = [];
  let length = 0;
  for await (const chunk of req) {
    length += (chunk as Buffer).length;
    if (length > MAX_BODY) throw new LoginError("Die Anfrage ist zu gross.", 413);
    chunks.push(chunk as Buffer);
  }
  try {
    const value = JSON.parse(Buffer.concat(chunks).toString("utf8") || "{}");
    return value && typeof value === "object" ? value : {};
  } catch {
    throw new LoginError("Ungültige Anfrage.", 400);
  }
}

/**
 * Schutz gegen Anfragen von fremden Seiten (zusätzlich zu SameSite=Strict): Schreibende Anfragen müssen JSON sein
 * (erzwingt bei fremden Ursprüngen einen CORS-Preflight, den der Dienst nicht beantwortet) und, falls der Browser
 * einen Origin mitschickt, vom selben Host kommen.
 */
function sameOrigin(req: IncomingMessage): boolean {
  if (!String(req.headers["content-type"] ?? "").toLowerCase().startsWith("application/json")) return false;
  const origin = req.headers.origin;
  if (!origin) return true;
  const host = (ENV.trustProxy && String(req.headers["x-forwarded-host"] ?? "")) || req.headers.host;
  try {
    return new URL(origin).host === host;
  } catch {
    return false;
  }
}

async function authenticate(username: string, password: string): Promise<SessionUser> {
  if (ENV.testMode) {
    const user = TEST_USERS[username];
    if (!user || password !== TEST_PASSWORD) throw new LoginError("Benutzername oder Passwort falsch.", 401);
    return user;
  }
  return ldapLogin(username, password);
}

async function login(req: IncomingMessage, res: ServerResponse): Promise<void> {
  if (!ENV.testMode && !isSecure(req) && !ENV.allowInsecureHttp) {
    return fail(res, 403, "Anmeldung nur über HTTPS.");
  }
  const body = await readJson(req);
  const username = normalizeUsername(String(body.username ?? ""));
  const password = typeof body.password === "string" ? body.password : "";
  const address = clientAddress(req);
  const keys = [`ip:${address}`, ...(username ? [`user:${username}`] : [])];

  const wait = lockedFor(keys);
  if (wait > 0) {
    res.setHeader("Retry-After", String(wait));
    log(`Anmeldung gesperrt: ${username || "(ungültig)"} von ${address}`);
    return fail(res, 429, `Zu viele Fehlversuche. Bitte in ${Math.ceil(wait / 60)} Minuten erneut versuchen.`);
  }

  try {
    if (!username || !password) throw new LoginError("Benutzername oder Passwort falsch.", 401);
    const user = await authenticate(username, password);
    recordSuccess([`user:${username}`]);
    setSessionCookie(res, user, isSecure(req));
    log(`Anmeldung erfolgreich: ${user.username} (${user.role}) von ${address}`);
    json(res, 200, { user, testMode: ENV.testMode } satisfies MeResponse);
  } catch (e) {
    if (e instanceof LoginError) {
      if (e.status === 401 || e.status === 403) recordFailure(keys);
      log(`Anmeldung fehlgeschlagen: ${username || "(ungültig)"} von ${address} (${e.status})`);
      return fail(res, e.status, e.message);
    }
    log(`Anmeldung nicht möglich: ${username} von ${address}: ${e instanceof Error ? e.message : String(e)}`);
    fail(res, 503, "Der Anmeldedienst ist gerade nicht erreichbar.");
  }
}

async function health(req: IncomingMessage, res: ServerResponse): Promise<void> {
  const body: HealthResponse = { status: "ok", version: ENV.version, testMode: ENV.testMode };
  if (sessionFromRequest(req)?.role === "admin") {
    const uptimeSeconds = Math.round((Date.now() - startedAt) / 1000);
    if (ENV.testMode) {
      body.details = {
        ldap: { ok: true, target: "Testmodus (kein LDAP)", latencyMs: 0, detail: "Testbenutzer admin und user" },
        db: { ok: true, target: "Testmodus (keine Datenbank)", latencyMs: 0, detail: "Erfundene Daten" },
        uptimeSeconds,
      };
    } else {
      const [ldap, db] = await Promise.all([ldapCheck(), dbCheck()]);
      body.details = { ldap, db, uptimeSeconds };
    }
  }
  json(res, 200, body);
}

/** true, wenn die Anfrage zur API gehört und beantwortet wurde */
export async function api(req: IncomingMessage, res: ServerResponse, path: string): Promise<boolean> {
  if (!path.startsWith("/api/")) return false;
  const method = req.method ?? "GET";
  try {
    if (method === "POST" && !sameOrigin(req)) {
      fail(res, 403, "Anfrage abgelehnt.");
      return true;
    }
    if (path === "/api/login" && method === "POST") await login(req, res);
    else if (path === "/api/logout" && method === "POST") {
      const user = sessionFromRequest(req);
      clearSessionCookie(res, isSecure(req));
      if (user) log(`Abgemeldet: ${user.username}`);
      res.writeHead(204, { "Cache-Control": "no-store" });
      res.end();
    } else if (path === "/api/me" && method === "GET") {
      const user = sessionFromRequest(req);
      if (user) json(res, 200, { user, testMode: ENV.testMode } satisfies MeResponse);
      else fail(res, 401, "Nicht angemeldet.");
    } else if (path === "/api/health" && method === "GET") await health(req, res);
    else if (path === "/api/customers" && method === "GET") {
      if (!sessionFromRequest(req)) fail(res, 401, "Nicht angemeldet.");
      else if (ENV.testMode) json(res, 200, { source: "test", items: TEST_CUSTOMERS } satisfies CustomerListResponse);
      else {
        try {
          json(res, 200, { source: "db", items: await listCustomers() } satisfies CustomerListResponse);
        } catch (e) {
          if (!(e instanceof DbError)) throw e;
          log(`Kunden nicht lesbar: ${e.message}`);
          fail(res, e.status, e.message);
        }
      }
    } else if (path === "/api/cis" && method === "GET") {
      if (!sessionFromRequest(req)) fail(res, 401, "Nicht angemeldet.");
      else json(res, 200, (ENV.testMode ? { source: "test", items: TEST_CIS } : { source: "none", items: [] }) satisfies CiListResponse);
    } else fail(res, 404, "Unbekannte Adresse.");
  } catch (e) {
    if (e instanceof LoginError) fail(res, e.status, e.message);
    else {
      log(`Fehler bei ${method} ${path}: ${e instanceof Error ? e.message : String(e)}`);
      fail(res, 500, "Interner Fehler.");
    }
  }
  return true;
}
