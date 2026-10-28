/** API des CMDB-Dienstes unter /api */
import type { IncomingMessage, ServerResponse } from "node:http";
import { AREAS, type Area, type AreaCreateResponse, type AreaFormResponse, type AreaListResponse, type AreaRow, type CustomerDetailResponse, type CustomerSaveResponse } from "@/lib/areas";
import type { CiListResponse, Customer, CustomerListResponse, HealthResponse, MeResponse, SessionUser } from "@/lib/types";
import { TEST_CIS, TEST_COUNTRIES, TEST_CUSTOMERS, TEST_OPTIONS, TEST_PASSWORD, TEST_USERS, testRows } from "@/lib/testData";
import { CUSTOMER_NAME_MAX } from "./customerLinks";
import { deleteRole, listLogins, listRoles, permissionsFor, recordLogin, saveRole, schemaState } from "./admin";
import { ACTIONS, PERMISSION_AREAS, can, type Action, type Permissions } from "@/lib/permissions";
import { DbError, areaForm, createAreaRow, createCustomer, dbCheck, deleteCustomer, getAreaRow, getCustomer, getDocument, listArea, listAreaForCompany, listCustomers, listDocuments, updateCustomer, type CustomerValues } from "./db";
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

/** Antwort für /api/me und die Anmeldung: Person ohne Gruppen, dazu ihre Rechte */
async function meResponse(user: SessionUser): Promise<MeResponse> {
  const { groups: _groups, ...visible } = user;
  return { user: visible, testMode: ENV.testMode, permissions: await permissionsFor(user) };
}

/** Angemeldete Person mit dem Recht für Bereich und Aktion, sonst Antwort 401/403 und null */
async function allowed(req: IncomingMessage, res: ServerResponse, area: string, action: Action): Promise<SessionUser | null> {
  const user = sessionFromRequest(req);
  if (!user) {
    fail(res, 401, "Nicht angemeldet.");
    return null;
  }
  if (!can(await permissionsFor(user), area, action)) {
    const label = PERMISSION_AREAS.find((a) => a.id === area)?.label ?? area;
    fail(res, 403, `Keine Berechtigung (${label}: ${ACTIONS.find((a) => a.id === action)?.label}).`);
    return null;
  }
  return user;
}

function adminOnly(req: IncomingMessage, res: ServerResponse): SessionUser | null {
  const user = sessionFromRequest(req);
  if (!user) fail(res, 401, "Nicht angemeldet.");
  else if (user.role !== "admin") fail(res, 403, "Nur für Admins.");
  else return user;
  return null;
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
    void recordLogin({ username: username || "(ungültig)", success: false, reason: "Gesperrt nach zu vielen Fehlversuchen", address });
    return fail(res, 429, `Zu viele Fehlversuche. Bitte in ${Math.ceil(wait / 60)} Minuten erneut versuchen.`);
  }

  try {
    if (!username || !password) throw new LoginError("Benutzername oder Passwort falsch.", 401);
    const user = await authenticate(username, password);
    recordSuccess([`user:${username}`]);
    setSessionCookie(res, user, isSecure(req));
    log(`Anmeldung erfolgreich: ${user.username} (${user.role}) von ${address}`);
    void recordLogin({ username: user.username, displayName: user.displayName, success: true, address });
    json(res, 200, await meResponse(user));
  } catch (e) {
    if (e instanceof LoginError) {
      if (e.status === 401 || e.status === 403) recordFailure(keys);
      log(`Anmeldung fehlgeschlagen: ${username || "(ungültig)"} von ${address} (${e.status})`);
      void recordLogin({ username: username || "(ungültig)", success: false, reason: e.status === 403 ? "Konto nicht freigegeben" : "Benutzername oder Passwort falsch", address });
      return fail(res, e.status, e.message);
    }
    log(`Anmeldung nicht möglich: ${username} von ${address}: ${e instanceof Error ? e.message : String(e)}`);
    void recordLogin({ username: username || "(ungültig)", success: false, reason: "Anmeldedienst nicht erreichbar", address });
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

/** Antwort aus der Datenbank; deren Fehler (fehlende Rechte, nicht erreichbar) gehen als verständliche Meldung zurück */
async function readDb(res: ServerResponse, read: () => Promise<unknown>): Promise<void> {
  try {
    json(res, 200, await read());
  } catch (e) {
    if (!(e instanceof DbError)) throw e;
    if (e.status !== 404) log(`Datenbank: ${e.message}`);
    fail(res, e.status, e.message);
  }
}

// Testmodus: neu angelegte Einträge, Kunden und Umbenennungen nur im Speicher (bis zum Neustart)
const testCreated = new Map<string, AreaRow[]>();
let testCustomers: Customer[] = [...TEST_CUSTOMERS];
const testRenames = new Map<string, string>();
const testExtra = new Map<number, { zip: string; address: string; email: string; country?: string }>();

function renamedCompany(name: string): string {
  let current = name;
  for (let i = 0; i < 10 && testRenames.has(current); i++) current = testRenames.get(current)!;
  return current;
}

function areaRows(area: Area): AreaRow[] {
  return [...testRows(area), ...(testCreated.get(area.id) ?? [])].map((r) => (typeof r.company === "string" ? { ...r, company: renamedCompany(r.company) } : r));
}


/** Testmodus: Formulardaten aus den erfundenen Daten */
function testForm(area: Area): AreaFormResponse {
  const options: Record<string, string[]> = {};
  for (const f of area.fields) {
    if (!f.options || !area.createFields?.includes(f.key)) continue;
    options[f.key] = f.options === "customers" ? testCustomers.map((c) => c.name) : (TEST_OPTIONS[f.key] ?? []);
  }
  return { nextId: Math.max(...areaRows(area).map((r) => r.id)) + 1, options };
}

/**
 * Eingaben prüfen: nur Felder des Formulars, Pflichtfelder gefüllt, Text bis 255 Zeichen, Datum als JJJJ-MM-TT,
 * Auswahlfelder nur mit Werten aus der Liste (wie in GAPTEQ)
 */
function validValues(area: Area, raw: unknown, form: AreaFormResponse): Record<string, string> {
  if (!raw || typeof raw !== "object") throw new LoginError("Ungültige Anfrage.", 400);
  const values: Record<string, string> = {};
  for (const f of area.fields) {
    if (!area.createFields?.includes(f.key)) continue;
    const v = (raw as Record<string, unknown>)[f.key] ?? "";
    if (typeof v !== "string") throw new LoginError(`${f.label}: ungültiger Wert.`, 400);
    const value = v.trim();
    if (f.required && !value) throw new LoginError(`${f.label} ist ein Pflichtfeld.`, 400);
    if (value.length > 255) throw new LoginError(`${f.label}: höchstens 255 Zeichen.`, 400);
    if (f.date && value && (!/^\d{4}-\d{2}-\d{2}$/.test(value) || Number.isNaN(Date.parse(value)))) throw new LoginError(`${f.label}: ungültiges Datum.`, 400);
    const allowed = form.options[f.key];
    if (value && allowed?.length && !allowed.includes(value)) throw new LoginError(`${f.label}: „${value}“ steht nicht in der Auswahlliste.`, 400);
    values[f.key] = value;
  }
  return values;
}

async function createInArea(req: IncomingMessage, res: ServerResponse, area: Area, user: SessionUser): Promise<void> {
  const body = await readJson(req);
  try {
    const values = validValues(area, body.values, ENV.testMode ? testForm(area) : await areaForm(area));
    if (ENV.testMode) {
      const row: AreaRow = { id: testForm(area).nextId ?? area.testIdBase };
      for (const f of area.fields) row[f.key] = f.key === "type" ? area.typeValue : (values[f.key] ?? "");
      testCreated.set(area.id, [...(testCreated.get(area.id) ?? []), row]);
      log(`Angelegt (Testmodus): ${area.singular} ${row.id} von ${user.username}`);
      return json(res, 201, { id: row.id } satisfies AreaCreateResponse);
    }
    const id = await createAreaRow(area, values);
    log(`Angelegt: ${area.singular} ${id} von ${user.username}`);
    json(res, 201, { id } satisfies AreaCreateResponse);
  } catch (e) {
    if (!(e instanceof DbError)) throw e;
    log(`Anlegen nicht möglich (${area.singular}, ${user.username}): ${e.message}`);
    fail(res, e.status, e.message);
  }
}

/** Kundenansicht: Stammdaten, Dokumente und alle Systeme je Bereich; ein nicht lesbarer Bereich verhindert die übrigen nicht */
async function customerDetail(id: number): Promise<CustomerDetailResponse> {
  if (ENV.testMode) {
    const c = testCustomers.find((x) => x.id === id);
    if (!c) throw new DbError("Diesen Kunden gibt es nicht.", 404);
    const systems: Record<string, AreaRow[]> = {};
    for (const area of Object.values(AREAS)) {
      const rows = areaRows(area).filter((r) => r.company === c.name);
      if (rows.length) systems[area.id] = rows;
    }
    const documents = id % 3 === 0 ? [{ id: id * 10 + 1, name: `Angebot-${c.name.replace(/\W+/g, "-")}.txt`, type: "Angebot" }] : [];
    const extra = testExtra.get(id);
    const customer = { ...c, country: extra?.country ?? TEST_COUNTRIES[id % TEST_COUNTRIES.length], zip: extra?.zip ?? "", address: extra?.address ?? "", email: extra?.email ?? "" };
    return { customer, documents, systems, errors: {}, source: "test" };
  }
  const customer = await getCustomer(id);
  if (!customer) throw new DbError("Diesen Kunden gibt es nicht.", 404);
  const systems: Record<string, AreaRow[]> = {};
  const errors: Record<string, string> = {};
  await Promise.all(
    Object.values(AREAS).map(async (area) => {
      try {
        const rows = await listAreaForCompany(area, customer.name);
        if (rows.length) systems[area.id] = rows;
      } catch (e) {
        if (!(e instanceof DbError)) throw e;
        errors[area.id] = e.message;
      }
    }),
  );
  let documents: CustomerDetailResponse["documents"] = [];
  let documentsError: string | undefined;
  try {
    documents = await listDocuments(customer);
  } catch (e) {
    if (!(e instanceof DbError)) throw e;
    documentsError = e.message;
  }
  return { customer, documents, documentsError, systems, errors, source: "db" };
}

/** Download eines Anhangs; Dateiname für den Browser bereinigt */
async function sendDocument(res: ServerResponse, customerId: number, documentId: number): Promise<void> {
  let doc: { name: string; data: Buffer } | null;
  if (ENV.testMode) {
    const c = testCustomers.find((x) => x.id === customerId);
    doc = c && documentId === customerId * 10 + 1 ? { name: `Angebot-${c.name.replace(/\W+/g, "-")}.txt`, data: Buffer.from(`Erfundenes Testdokument für ${c.name}.\n`) } : null;
  } else {
    const customer = await getCustomer(customerId);
    doc = customer ? await getDocument(customer, documentId) : null;
  }
  if (!doc) return fail(res, 404, "Dieses Dokument gibt es nicht.");
  const ascii = doc.name.replace(/[^\w.\- ]+/g, "_");
  res.writeHead(200, {
    "Content-Type": "application/octet-stream",
    "Content-Length": doc.data.length,
    "Content-Disposition": `attachment; filename="${ascii}"; filename*=UTF-8''${encodeURIComponent(doc.name)}`,
    "Cache-Control": "no-store",
  });
  res.end(doc.data);
}

/** Eingaben für Kunden prüfen: Name Pflicht und höchstens so lang wie die kürzeste verknüpfte Spalte */
function customerValues(raw: unknown, full: boolean): CustomerValues {
  if (!raw || typeof raw !== "object") throw new LoginError("Ungültige Anfrage.", 400);
  const get = (key: string, max: number) => {
    const v = (raw as Record<string, unknown>)[key] ?? "";
    if (typeof v !== "string") throw new LoginError("Ungültiger Wert.", 400);
    if (v.trim().length > max) throw new LoginError(`Höchstens ${max} Zeichen.`, 400);
    return v.trim();
  };
  const values = { name: get("name", CUSTOMER_NAME_MAX), country: get("country", 255), city: get("city", 100), zip: full ? get("zip", 255) : "", address: full ? get("address", 255) : "", email: full ? get("email", 255) : "" };
  if (!values.name) throw new LoginError("Kunde ist ein Pflichtfeld.", 400);
  if (values.email && !/^[^\s@]+@[^\s@]+$/.test(values.email)) throw new LoginError("E-Mail: ungültige Adresse.", 400);
  return values;
}

async function saveCustomer(req: IncomingMessage, res: ServerResponse, user: SessionUser, id?: number): Promise<void> {
  const values = customerValues((await readJson(req)).values, id !== undefined);
  try {
    if (ENV.testMode) {
      const taken = testCustomers.some((c) => c.name.toLowerCase() === values.name.toLowerCase() && c.id !== id);
      if (taken) throw new DbError(`Den Kunden „${values.name}“ gibt es schon.`, 409);
      if (id === undefined) {
        const newId = Math.max(...testCustomers.map((c) => c.id)) + 1;
        testCustomers = [...testCustomers, { id: newId, name: values.name, city: values.city }].sort((a, b) => a.name.localeCompare(b.name, "de"));
        testExtra.set(newId, { zip: "", address: "", email: "", country: values.country });
        log(`Kunde angelegt (Testmodus): ${newId} von ${user.username}`);
        return json(res, 201, { id: newId } satisfies CustomerSaveResponse);
      }
      const current = testCustomers.find((c) => c.id === id);
      if (!current) throw new DbError("Diesen Kunden gibt es nicht.", 404);
      const renamed: { label: string; count: number }[] = [];
      if (current.name !== values.name) {
        for (const area of Object.values(AREAS)) {
          const count = areaRows(area).filter((r) => r.company === current.name).length;
          if (count) renamed.push({ label: area.plural ?? area.singular, count });
        }
        testRenames.set(current.name, values.name);
      }
      testCustomers = testCustomers.map((c) => (c.id === id ? { ...c, name: values.name, city: values.city } : c)).sort((a, b) => a.name.localeCompare(b.name, "de"));
      testExtra.set(id, { zip: values.zip, address: values.address, email: values.email, country: values.country });
      log(`Kunde geändert (Testmodus): ${id} von ${user.username}`);
      return json(res, 200, { id, renamed } satisfies CustomerSaveResponse);
    }
    if (id === undefined) {
      const newId = await createCustomer(values);
      log(`Kunde angelegt: ${newId} von ${user.username}`);
      return json(res, 201, { id: newId } satisfies CustomerSaveResponse);
    }
    const { renamed } = await updateCustomer(id, values);
    log(`Kunde geändert: ${id} von ${user.username}${renamed.length ? `, umbenannt in ${renamed.map((r) => `${r.label} (${r.count})`).join(", ")}` : ""}`);
    json(res, 200, { id, renamed } satisfies CustomerSaveResponse);
  } catch (e) {
    if (!(e instanceof DbError)) throw e;
    log(`Kunde nicht gespeichert (${user.username}): ${e.message}`);
    fail(res, e.status, e.message);
  }
}

async function removeCustomer(res: ServerResponse, user: SessionUser, id: number): Promise<void> {
  try {
    if (ENV.testMode) {
      const c = testCustomers.find((x) => x.id === id);
      if (!c) throw new DbError("Diesen Kunden gibt es nicht.", 404);
      const refs = Object.values(AREAS)
        .map((a) => ({ label: a.plural ?? a.singular, count: areaRows(a).filter((r) => r.company === c.name).length }))
        .filter((r) => r.count);
      if (refs.length) throw new DbError(`Löschen nicht möglich, dem Kunden ist noch etwas zugeordnet: ${refs.map((r) => `${r.label} (${r.count})`).join(", ")}.`, 409);
      testCustomers = testCustomers.filter((x) => x.id !== id);
    } else await deleteCustomer(id);
    log(`Kunde gelöscht: ${id} von ${user.username}`);
    res.writeHead(204, { "Cache-Control": "no-store" });
    res.end();
  } catch (e) {
    if (!(e instanceof DbError)) throw e;
    log(`Kunde nicht gelöscht (${user.username}): ${e.message}`);
    fail(res, e.status, e.message);
  }
}

/** Kundenansicht: nur Bereiche, die die Person lesen darf */
function withoutHiddenAreas(detail: CustomerDetailResponse, permissions: Permissions): CustomerDetailResponse {
  const systems = Object.fromEntries(Object.entries(detail.systems).filter(([area]) => can(permissions, area, "read")));
  const errors = Object.fromEntries(Object.entries(detail.errors).filter(([area]) => can(permissions, area, "read")));
  return { ...detail, systems, errors };
}

/** Rolle aus der Anfrage prüfen: Name, Beschreibung, Rechte nur für bekannte Bereiche, Mitglieder Person oder Gruppe */
function roleInput(raw: unknown) {
  if (!raw || typeof raw !== "object") throw new LoginError("Ungültige Anfrage.", 400);
  const r = raw as Record<string, unknown>;
  const name = typeof r.name === "string" ? r.name.trim() : "";
  if (!name || name.length > 100) throw new LoginError("Name: 1 bis 100 Zeichen.", 400);
  const description = typeof r.description === "string" ? r.description.trim().slice(0, 500) : "";
  const permissions: Permissions = {};
  const rawPerms = (r.permissions ?? {}) as Record<string, Record<string, unknown>>;
  for (const area of PERMISSION_AREAS) {
    const x = rawPerms[area.id] ?? {};
    permissions[area.id] = { read: x.read === true, create: x.create === true, edit: x.edit === true, delete: x.delete === true };
    // Wer anlegen, bearbeiten oder löschen darf, muss auch lesen dürfen
    if (permissions[area.id].create || permissions[area.id].edit || permissions[area.id].delete) permissions[area.id].read = true;
  }
  const members = (Array.isArray(r.members) ? r.members : []).map((m) => {
    const kind = (m as { kind?: unknown }).kind;
    const memberName = String((m as { name?: unknown }).name ?? "").trim().toLowerCase();
    if ((kind !== "user" && kind !== "group") || !memberName || memberName.length > 256 || /[\x00-\x1f]/.test(memberName)) throw new LoginError("Ungültiges Mitglied.", 400);
    return { kind, name: kind === "user" ? normalizeUsername(memberName) || memberName : memberName } as const;
  });
  return { name, description, permissions, members };
}

/** Verwaltung: Anmelde-Protokoll und Rollen, nur für Admins */
async function adminApi(req: IncomingMessage, res: ServerResponse, path: string, method: string): Promise<void> {
  const user = adminOnly(req, res);
  if (!user) return;
  const roleId = /^\/api\/admin\/roles\/(\d+)$/.exec(path)?.[1];
  try {
    if (path === "/api/admin/logins" && method === "GET") json(res, 200, { items: await listLogins(), schema: schemaState });
    else if (path === "/api/admin/roles" && method === "GET") json(res, 200, { items: await listRoles(), areas: PERMISSION_AREAS, schema: schemaState });
    else if (path === "/api/admin/roles" && method === "POST") {
      const id = await saveRole(undefined, roleInput((await readJson(req)).role), user.username);
      log(`Rolle ${id} angelegt von ${user.username}`);
      json(res, 201, { id });
    } else if (roleId && method === "PUT") {
      await saveRole(Number(roleId), roleInput((await readJson(req)).role), user.username);
      log(`Rolle ${roleId} geändert von ${user.username}`);
      json(res, 200, { id: Number(roleId) });
    } else if (roleId && method === "DELETE") {
      await deleteRole(Number(roleId));
      log(`Rolle ${roleId} gelöscht von ${user.username}`);
      res.writeHead(204, { "Cache-Control": "no-store" });
      res.end();
    } else fail(res, 404, "Unbekannte Adresse.");
  } catch (e) {
    if (!(e instanceof DbError)) throw e;
    fail(res, e.status, e.message);
  }
}

/** true, wenn die Anfrage zur API gehört und beantwortet wurde */
export async function api(req: IncomingMessage, res: ServerResponse, path: string): Promise<boolean> {
  if (!path.startsWith("/api/")) return false;
  const method = req.method ?? "GET";
  try {
    if ((method === "POST" || method === "PUT" || method === "DELETE") && !sameOrigin(req)) {
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
      if (user) json(res, 200, await meResponse(user));
      else fail(res, 401, "Nicht angemeldet.");
    } else if (path === "/api/health" && method === "GET") await health(req, res);
    else if (path === "/api/customers" && method === "GET") {
      if (!(await allowed(req, res, "kunden", "read"))) return true;
      if (ENV.testMode) json(res, 200, { source: "test", items: testCustomers } satisfies CustomerListResponse);
      else {
        try {
          json(res, 200, { source: "db", items: await listCustomers() } satisfies CustomerListResponse);
        } catch (e) {
          if (!(e instanceof DbError)) throw e;
          log(`Kunden nicht lesbar: ${e.message}`);
          fail(res, e.status, e.message);
        }
      }
    } else if (/^\/api\/areas\/[a-z-]+\/form$/.test(path) && method === "GET") {
      const areaId = path.split("/")[3];
      const area = Object.hasOwn(AREAS, areaId) ? AREAS[areaId] : undefined;
      if (!area?.createFields) fail(res, 404, "Dieser Bereich kann nicht angelegt werden.");
      else if (await allowed(req, res, area.id, "create")) await readDb(res, async () => (ENV.testMode ? testForm(area) : await areaForm(area)));
    } else if (/^\/api\/areas\/[a-z-]+$/.test(path) && method === "POST") {
      const areaId = path.split("/")[3];
      const area = Object.hasOwn(AREAS, areaId) ? AREAS[areaId] : undefined;
      if (!area?.createFields) {
        if (sessionFromRequest(req)) fail(res, 404, "Dieser Bereich kann nicht angelegt werden.");
        else fail(res, 401, "Nicht angemeldet.");
      } else {
        const user = await allowed(req, res, area.id, "create");
        if (user) await createInArea(req, res, area, user);
      }
    } else if (/^\/api\/areas\/[a-z-]+(\/\d+)?$/.test(path) && method === "GET") {
      const [, , , areaId, rawId] = path.split("/");
      const area = Object.hasOwn(AREAS, areaId) ? AREAS[areaId] : undefined;
      if (!area) fail(res, sessionFromRequest(req) ? 404 : 401, sessionFromRequest(req) ? "Unbekannter Bereich." : "Nicht angemeldet.");
      else if (!(await allowed(req, res, area.id, "read"))) return true;
      else if (rawId === undefined)
        await readDb(res, async () => ({ source: ENV.testMode ? "test" : "db", items: ENV.testMode ? areaRows(area) : await listArea(area) }) satisfies AreaListResponse);
      else
        await readDb(res, async () => {
          const id = Number(rawId);
          const row: AreaRow | null | undefined = ENV.testMode ? areaRows(area).find((r) => r.id === id) : await getAreaRow(area, id);
          if (!row) throw new DbError(`Diesen Eintrag (${area.singular} ${id}) gibt es nicht.`, 404);
          return row;
        });
    } else if (path === "/api/customers" && method === "POST") {
      const user = await allowed(req, res, "kunden", "create");
      if (user) await saveCustomer(req, res, user);
    } else if (/^\/api\/customers\/\d+$/.test(path) && (method === "PUT" || method === "DELETE")) {
      const id = Number(path.split("/")[3]);
      const user = await allowed(req, res, "kunden", method === "PUT" ? "edit" : "delete");
      if (user && method === "PUT") await saveCustomer(req, res, user, id);
      else if (user) await removeCustomer(res, user, id);
    } else if (/^\/api\/customers\/\d+$/.test(path) && method === "GET") {
      const user = await allowed(req, res, "kunden", "read");
      if (user) {
        const permissions = await permissionsFor(user);
        await readDb(res, async () => withoutHiddenAreas(await customerDetail(Number(path.split("/")[3])), permissions));
      }
    } else if (/^\/api\/customers\/\d+\/documents\/\d+$/.test(path) && method === "GET") {
      const parts = path.split("/");
      const user = await allowed(req, res, "kunden", "read");
      if (user) {
        try {
          await sendDocument(res, Number(parts[3]), Number(parts[5]));
          log(`Dokument ${parts[5]} (Kunde ${parts[3]}) geladen von ${user.username}`);
        } catch (e) {
          if (!(e instanceof DbError)) throw e;
          fail(res, e.status, e.message);
        }
      }
    } else if (path.startsWith("/api/admin/")) {
      await adminApi(req, res, path, method);
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
