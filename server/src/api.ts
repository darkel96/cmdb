/** API des CMDB-Dienstes unter /api */
import type { IncomingMessage, ServerResponse } from "node:http";
import { AREAS, SYSTEM_STATUS, editableFields, firstFreeId, type Area, type AreaCreateResponse, type AreaFormResponse, type AreaListResponse, type AreaRow, type CustomerDetailResponse, type CustomerSaveResponse } from "@/lib/areas";
import type { CheckResult, CiListResponse, Customer, CustomerListResponse, HealthResponse, MeResponse, SessionUser } from "@/lib/types";
import { TEST_CIS, TEST_COUNTRIES, TEST_CUSTOMERS, TEST_OPTIONS, TEST_PASSWORD, TEST_PMS_PRICES, TEST_USERS, testPmsModules, testRows } from "@/lib/testData";
import { PMS_AREA, PMS_PRICE_COLUMNS, PMS_PRICE_MAX, PMS_WRITE, euro, samePrices, type PmsModule, type PmsPrice, type PmsPrices, type PmsResponse } from "@/lib/pms";
import { CUSTOMER_NAME_MAX } from "./customerLinks";
import { deleteRole, initAdminStore, listLogins, listRoles, permissionsFor, recordLogin, saveRole, schemaState } from "./admin";
import { ACTIONS, PERMISSION_AREAS, can, type Action, type Permissions } from "@/lib/permissions";
import { LOOKUP_LISTS, PMS_PRICE_LIST, canChangeList, type StammdatenResponse } from "@/lib/stammdaten";
import { DbError, areaForm, changeLookup, lookupValues, createAreaRow, updateAreaRow, createCustomer, dbCheck, deleteCustomer, deleteAreaRow, getAreaRow, getAreaSecret, getCustomer, resetPool, addCustomerDocument, followOsRename, listOsSupport, saveOsSupport, addSystemDocument, getDocument, getSystemDocument, listSystemDocuments, listArea, listAreaForCompany, listCustomers, listPms, addPmsModule, changePmsModule, changePmsPrice, listDocuments, updateCustomer, type CustomerValues } from "./db";
import { ENV } from "./env";
import { sendMail, smtpCheck } from "./mail";
import { candidate, resetSettings, saveSettings, settings, settingsMeta, settingsView, type AllSettings, type DbSettings, type LdapSettings, type Section, type SmtpSettings } from "./settings";
import { SETTINGS_SECTIONS, type SettingsResponse } from "@/lib/settings";
import { LoginError, ldapCheck, ldapLogin, normalizeUsername } from "./ldap";
import { isLocalAdmin, localAdminLogin } from "./localAccount";
import { OS_SUPPORT_SEED, withOsSupport, type OsSupportEntry } from "@/lib/osSupport";
import { listChanges, recordChange } from "./history";
import type { HistoryChange, HistoryResponse } from "@/lib/history";
import { log } from "./log";
import { lockedFor, recordFailure, recordSuccess } from "./rateLimit";
import { clearSessionCookie, sessionFromRequest, setSessionCookie } from "./session";

const MAX_BODY = 16 * 1024;
/** Kunden-Dokumente: höchstens 15 MB je Datei (als Base64 im JSON etwa ein Drittel grösser) */
const MAX_DOCUMENT = 15 * 1024 * 1024;
const MAX_DOCUMENT_BODY = Math.ceil((MAX_DOCUMENT * 4) / 3) + 16 * 1024;
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

async function readJson(req: IncomingMessage, max = MAX_BODY): Promise<Record<string, unknown>> {
  const chunks: Buffer[] = [];
  let length = 0;
  for await (const chunk of req) {
    length += (chunk as Buffer).length;
    if (length > max) throw new LoginError("Die Anfrage ist zu gross.", 413);
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

/** Stammdaten: Recht für alle Listen oder genau diese Liste (z. B. Stammdaten › Hersteller), sonst 401/403 und null */
async function allowedList(req: IncomingMessage, res: ServerResponse, list: { id: string; label: string }, action: "create" | "edit" | "delete"): Promise<SessionUser | null> {
  const user = sessionFromRequest(req);
  if (!user) {
    fail(res, 401, "Nicht angemeldet.");
    return null;
  }
  const permissions = await permissionsFor(user);
  if (!canChangeList((a, x) => can(permissions, a, x), list.id, action)) {
    fail(res, 403, `Keine Berechtigung (Stammdaten › ${list.label}: ${ACTIONS.find((a) => a.id === action)?.label}).`);
    return null;
  }
  return user;
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
  // Lokales Konto: nie gegen das AD, falsches Passwort zählt wie jeder Fehlversuch (Sperre nach Fehlversuchen)
  if (isLocalAdmin(username)) {
    const local = localAdminLogin(username, password);
    if (!local) throw new LoginError("Benutzername oder Passwort falsch.", 401);
    return local;
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
    const remember = body.remember === true;
    setSessionCookie(res, user, isSecure(req), remember);
    log(`Anmeldung erfolgreich: ${user.username} (${user.role}) von ${address}${remember ? `, angemeldet bleiben ${ENV.rememberDays} Tage` : ""}`);
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
        smtp: settings("smtp").host
          ? { ok: true, target: `${settings("smtp").host}:${settings("smtp").port}`, latencyMs: 0, detail: "Testmodus: Mails werden nicht gesendet" }
          : { ok: false, target: "(nicht eingerichtet)", error: "Kein SMTP-Server eingetragen." },
        uptimeSeconds,
      };
    } else {
      const [ldap, db, smtp] = await Promise.all([ldapCheck(), dbCheck(), smtpCheck()]);
      body.details = { ldap, db, smtp, uptimeSeconds };
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

// Testmodus: neu angelegte und geänderte Einträge, Kunden und Umbenennungen nur im Speicher (bis zum Neustart)
const testCreated = new Map<string, AreaRow[]>();
const testEdits = new Map<string, AreaRow>();
// Testmodus: gelöschte Einträge, Schlüssel „bereich:id“
const testDeleted = new Set<string>();
// Testmodus: Passwörter (erfunden), Schlüssel „bereich:id“
const testSecrets = new Map<string, string>();
let testCustomers: Customer[] = [...TEST_CUSTOMERS];
const testRenames = new Map<string, string>();
const testExtra = new Map<number, { zip: string; address: string; email: string; country?: string }>();

function renamedCompany(name: string): string {
  let current = name;
  for (let i = 0; i < 10 && testRenames.has(current); i++) current = testRenames.get(current)!;
  return current;
}

function areaRows(area: Area): AreaRow[] {
  // Neu angelegte ersetzen erfundene Einträge mit derselben Nummer (nach Löschen wieder vergeben)
  const byId = new Map([...testRows(area), ...(testCreated.get(area.id) ?? [])].map((r) => [r.id, r]));
  return [...byId.values()]
    .filter((r) => !testDeleted.has(`${area.id}:${r.id}`))
    .map((r) => (area.secret ? { ...r, secretSet: (testSecrets.get(`${area.id}:${r.id}`) ?? "x") ? 1 : 0 } : r))
    .map((r) => testEdits.get(`${area.id}:${r.id}`) ?? r)
    .map((r) => (typeof r.company === "string" ? { ...r, company: renamedCompany(r.company) } : r));
}


/** Testmodus: Formulardaten aus den erfundenen Daten */
function testForm(area: Area): AreaFormResponse {
  const options: Record<string, string[]> = {};
  for (const f of area.fields) {
    if (!f.options || !area.createFields?.includes(f.key)) continue;
    // Listen aus den Stammdaten (im Testmodus gepflegt im Speicher), sonst die festen Testwerte
    const list = typeof f.options === "object" ? LOOKUP_LISTS.find((l) => l.table === (f.options as { table: string }).table) : undefined;
    options[f.key] = f.options === "customers" ? testCustomers.map((c) => c.name) : list ? [...(testLookups.get(list.id) ?? [])] : (TEST_OPTIONS[f.key] ?? []);
  }
  return { nextId: firstFreeId(area, areaRows(area).map((r) => r.id)), options };
}

/**
 * Eingaben prüfen: nur Felder des Formulars, Pflichtfelder gefüllt, Text bis 255 Zeichen, Datum als JJJJ-MM-TT,
 * Auswahlfelder nur mit Werten aus der Liste (wie in GAPTEQ)
 */
function validValues(area: Area, raw: unknown, form: AreaFormResponse, original?: Record<string, string>, only?: string[]): Record<string, string> {
  if (!raw || typeof raw !== "object") throw new LoginError("Ungültige Anfrage.", 400);
  const values: Record<string, string> = {};
  for (const f of area.fields) {
    if (!area.createFields?.includes(f.key) || area.createFixed?.[f.key] !== undefined) continue;
    // Beim Bearbeiten nur die Felder, die die Person ändern darf (Feldgruppen); andere bleiben, wie sie sind
    if (only && !only.includes(f.key)) continue;
    const v = (raw as Record<string, unknown>)[f.key] ?? "";
    if (typeof v !== "string") throw new LoginError(`${f.label}: ungültiger Wert.`, 400);
    const value = v.trim();
    if (f.required && !value) throw new LoginError(`${f.label} ist ein Pflichtfeld.`, 400);
    if (value.length > 255) throw new LoginError(`${f.label}: höchstens 255 Zeichen.`, 400);
    if (f.date && value && (!/^\d{4}-\d{2}-\d{2}$/.test(value) || Number.isNaN(Date.parse(value)))) throw new LoginError(`${f.label}: ungültiges Datum.`, 400);
    const allowed = form.options[f.key];
    // Beim Bearbeiten darf ein alter Wert, der nicht mehr in der Liste steht, unverändert bleiben
    if (value && allowed?.length && !allowed.includes(value) && value !== (original?.[f.key] ?? "")) throw new LoginError(`${f.label}: „${value}“ steht nicht in der Auswahlliste.`, 400);
    values[f.key] = value;
  }
  return values;
}

/**
 * Neues Passwort aus dem Formular; leer = nicht übergeben (beim Bearbeiten: unverändert). Mit clear (nur beim
 * Bearbeiten, Knopf „Entfernen“) wird es gelöscht: Rückgabe "" für die Spalte.
 */
function secretValue(area: Area, raw: unknown, clear = false): Record<string, string> {
  if (!area.secret) return {};
  if (clear) return { [area.secret.key]: "" };
  if (!raw || typeof raw !== "object") return {};
  const v = (raw as Record<string, unknown>)[area.secret.key];
  if (v === undefined || v === "") return {};
  if (typeof v !== "string") throw new LoginError(`${area.secret.label}: ungültiger Wert.`, 400);
  if (v.length > 255) throw new LoginError(`${area.secret.label}: höchstens 255 Zeichen.`, 400);
  return { [area.secret.key]: v };
}

/** Passwort eines Eintrags einzeln abrufen (Anzeigen/Kopieren); protokolliert wird nur, wer es abgerufen hat */
async function sendSecret(res: ServerResponse, area: Area, id: number, user: SessionUser): Promise<void> {
  try {
    let value: string | null;
    if (ENV.testMode) value = areaRows(area).some((r) => r.id === id) ? (testSecrets.get(`${area.id}:${id}`) ?? `Test-${id}-Kennwort`) : null;
    else value = await getAreaSecret(area, id);
    if (value === null) return fail(res, 404, `Diesen Eintrag (${area.singular} ${id}) gibt es nicht.`);
    log(`${area.secret?.label} abgerufen: ${area.singular} ${id} von ${user.username}`);
    json(res, 200, { value });
  } catch (e) {
    if (!(e instanceof DbError)) throw e;
    fail(res, e.status, e.message);
  }
}

/** Für den Änderungsverlauf: Felder mit Wert (Anlegen: new, Löschen: old); Passwort nur als „gesetzt“ */
function snapshot(area: Area, values: Record<string, string>, as: "old" | "new"): HistoryChange[] {
  const list: HistoryChange[] = area.fields
    .filter((f) => f.key !== "type" && String(values[f.key] ?? "").trim())
    .map((f) => ({ label: f.label, [as]: String(values[f.key]) }));
  if (area.secret && values[area.secret.key]) list.push({ label: area.secret.label, secret: true });
  return list;
}

/** Für den Änderungsverlauf: geänderte Felder alt → neu */
function diff(area: Area, before: Record<string, string>, after: Record<string, string>): HistoryChange[] {
  const list: HistoryChange[] = area.fields
    .filter((f) => f.key in after && String(before[f.key] ?? "") !== String(after[f.key] ?? ""))
    .map((f) => ({ label: f.label, old: String(before[f.key] ?? ""), new: String(after[f.key] ?? "") }));
  if (area.secret && area.secret.key in after) list.push({ label: area.secret.label, secret: true, new: after[area.secret.key] ? "gesetzt" : "entfernt" });
  return list;
}

/** Eintrag löschen (Recht Löschen); body.original: Werte beim Öffnen, wie beim Bearbeiten */
async function deleteInArea(req: IncomingMessage, res: ServerResponse, area: Area, user: SessionUser, id: number): Promise<void> {
  const body = await readJson(req);
  try {
    const original = originalValues(body.original);
    if (ENV.testMode) {
      const row = areaRows(area).find((r) => r.id === id);
      if (!row) throw new DbError(`Diesen Eintrag (${area.singular} ${id}) gibt es nicht.`, 404);
      const meanwhile = area.fields.filter((f) => f.key in original && String(row[f.key] ?? "") !== original[f.key]);
      if (meanwhile.length) throw new DbError(`Der Eintrag wurde inzwischen geändert (${meanwhile.map((f) => f.label).join(", ")}). Bitte neu laden.`, 409);
      testDeleted.add(`${area.id}:${id}`);
      testEdits.delete(`${area.id}:${id}`);
      testSecrets.delete(`${area.id}:${id}`);
    } else await deleteAreaRow(area, id, original);
    log(`Gelöscht: ${area.singular} ${id} von ${user.username}`);
    await recordChange(user.username, area.id, id, "gelöscht", snapshot(area, original, "old"));
    res.writeHead(204, { "Cache-Control": "no-store" });
    res.end();
  } catch (e) {
    if (!(e instanceof DbError)) throw e;
    log(`Löschen nicht möglich (${area.singular} ${id}, ${user.username}): ${e.message}`);
    fail(res, e.status, e.message);
  }
}

async function createInArea(req: IncomingMessage, res: ServerResponse, area: Area, user: SessionUser): Promise<void> {
  const body = await readJson(req);
  try {
    // Feste Werte (z. B. EOL „Nein“) setzt der Dienst selbst, nicht der Browser
    const values = { ...validValues(area, body.values, ENV.testMode ? testForm(area) : await areaForm(area)), ...secretValue(area, body.values), ...(area.createFixed ?? {}) };
    if (ENV.testMode) {
      const row: AreaRow = { id: testForm(area).nextId ?? area.testIdBase };
      for (const f of area.fields) row[f.key] = f.key === "type" ? area.typeValue : (values[f.key] ?? "");
      if (area.secret) testSecrets.set(`${area.id}:${row.id}`, values[area.secret.key] ?? "");
      // Wieder vergebene Nummer (nach Löschen): alter Stand dieser Nummer gilt nicht mehr
      const key = `${area.id}:${row.id}`;
      testDeleted.delete(key);
      testEdits.delete(key);
      testCreated.set(area.id, [...(testCreated.get(area.id) ?? []).filter((r) => r.id !== row.id), row]);
      log(`Angelegt (Testmodus): ${area.singular} ${row.id} von ${user.username}`);
      await recordChange(user.username, area.id, row.id, "angelegt", snapshot(area, values, "new"));
      return json(res, 201, { id: row.id } satisfies AreaCreateResponse);
    }
    const id = await createAreaRow(area, values);
    log(`Angelegt: ${area.singular} ${id} von ${user.username}`);
    await recordChange(user.username, area.id, id, "angelegt", snapshot(area, values, "new"));
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
      if (rows.length) systems[area.id] = await decorate(area, rows);
    }
    const documents = [
      ...(id % 3 === 0 ? [{ id: id * 10 + 1, name: `Angebot-${c.name.replace(/\W+/g, "-")}.txt`, type: "Angebot" }] : []),
      ...(testDocuments.get(id) ?? []).map(({ id: docId, name }) => ({ id: docId, name, type: "Angebot" })),
    ];
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
        if (rows.length) systems[area.id] = await decorate(area, rows);
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

// Testmodus: hochgeladene Kunden-Dokumente im Speicher
const testDocuments = new Map<number, { id: number; name: string; data: Buffer }[]>();
let testDocumentId = 900_000;

/** Dokument direkt am Kunden hochladen ({name, data: Base64}); gespeichert wie in GAPTEQ (dbo.Anhang, Typ „Angebot“) */
/** Hochgeladene Datei aus der Anfrage ({name, data: Base64}) prüfen; für Kunden und Systeme gleich */
async function readUpload(req: IncomingMessage): Promise<{ name: string; data: Buffer }> {
  const body = await readJson(req, MAX_DOCUMENT_BODY);
  // Nur der Dateiname, ohne Pfad; Steuerzeichen raus
  const name = (typeof body.name === "string" ? body.name : "").split(/[\\/]/).pop()!.replace(/[\u0000-\u001f]/g, "").trim();
  if (!name) throw new LoginError("Dateiname fehlt.", 400);
  if (name.length > 255) throw new LoginError("Der Dateiname ist zu lang (höchstens 255 Zeichen).", 400);
  if (typeof body.data !== "string" || !/^[A-Za-z0-9+/]*={0,2}$/.test(body.data)) throw new LoginError("Ungültiger Dateiinhalt.", 400);
  const data = Buffer.from(body.data, "base64");
  if (data.length === 0) throw new LoginError("Die Datei ist leer.", 400);
  if (data.length > MAX_DOCUMENT) throw new LoginError("Die Datei ist zu gross (höchstens 15 MB).", 413);
  return { name, data };
}

async function uploadDocument(req: IncomingMessage, res: ServerResponse, customerId: number, user: SessionUser): Promise<void> {
  const { name, data } = await readUpload(req);
  try {
    let id: number;
    if (ENV.testMode) {
      if (!testCustomers.some((c) => c.id === customerId)) throw new DbError("Diesen Kunden gibt es nicht.", 404);
      id = ++testDocumentId;
      testDocuments.set(customerId, [...(testDocuments.get(customerId) ?? []), { id, name, data }]);
    } else {
      const customer = await getCustomer(customerId);
      if (!customer) throw new DbError("Diesen Kunden gibt es nicht.", 404);
      id = await addCustomerDocument(customer, name, data);
    }
    log(`Dokument ${id} (Kunde ${customerId}, ${Math.ceil(data.length / 1024)} KB) hochgeladen von ${user.username}`);
    await recordChange(user.username, "kunden", customerId, "dokument", [{ label: "Datei", new: name }]);
    json(res, 201, { id });
  } catch (e) {
    if (!(e instanceof DbError)) throw e;
    fail(res, e.status, e.message);
  }
}

// Testmodus: Dokumente an Systemen im Speicher, Schlüssel „bereich:id“
const testSystemDocuments = new Map<string, { id: number; name: string; data: Buffer }[]>();

/** Dokumente eines Systems: Liste (GET …/documents), Download (GET …/documents/<id>), Hochladen (POST …/documents) */
async function systemDocuments(req: IncomingMessage, res: ServerResponse, area: Area, id: number, documentId: number | undefined, method: string): Promise<void> {
  const user = await allowed(req, res, area.id, method === "POST" ? "edit" : "read");
  if (!user) return;
  try {
    const row = ENV.testMode ? areaRows(area).find((r) => r.id === id) : await getAreaRow(area, id);
    if (!row) throw new DbError(`Diesen Eintrag (${area.singular} ${id}) gibt es nicht.`, 404);
    const key = `${area.id}:${id}`;
    if (method === "POST") {
      const { name, data } = await readUpload(req);
      let docId: number;
      if (ENV.testMode) {
        docId = ++testDocumentId;
        testSystemDocuments.set(key, [...(testSystemDocuments.get(key) ?? []), { id: docId, name, data }]);
      } else docId = await addSystemDocument(area, row, name, data);
      log(`Dokument ${docId} (${area.singular} ${id}, ${Math.ceil(data.length / 1024)} KB) hochgeladen von ${user.username}`);
      await recordChange(user.username, area.id, id, "dokument", [{ label: "Datei", new: name }]);
      return json(res, 201, { id: docId });
    }
    if (documentId === undefined) {
      const documents = ENV.testMode
        ? (testSystemDocuments.get(key) ?? []).map((d) => ({ id: d.id, name: d.name, type: area.typeValue }))
        : await listSystemDocuments(id);
      return json(res, 200, { documents });
    }
    const doc = ENV.testMode ? (testSystemDocuments.get(key)?.find((d) => d.id === documentId) ?? null) : await getSystemDocument(id, documentId);
    if (!doc) return fail(res, 404, "Dieses Dokument gibt es nicht.");
    log(`Dokument ${documentId} (${area.singular} ${id}) geladen von ${user.username}`);
    sendFile(res, doc);
  } catch (e) {
    if (!(e instanceof DbError)) throw e;
    fail(res, e.status, e.message);
  }
}

/** Datei an den Browser; Dateiname bereinigt */
function sendFile(res: ServerResponse, doc: { name: string; data: Buffer }): void {
  const ascii = doc.name.replace(/[^\w.\- ]+/g, "_");
  res.writeHead(200, {
    "Content-Type": "application/octet-stream",
    "Content-Length": doc.data.length,
    "Content-Disposition": `attachment; filename="${ascii}"; filename*=UTF-8''${encodeURIComponent(doc.name)}`,
    "Cache-Control": "no-store",
  });
  res.end(doc.data);
}

/** Download eines Anhangs; Dateiname für den Browser bereinigt */
async function sendDocument(res: ServerResponse, customerId: number, documentId: number): Promise<void> {
  let doc: { name: string; data: Buffer } | null;
  if (ENV.testMode) {
    const c = testCustomers.find((x) => x.id === customerId);
    doc =
      c && documentId === customerId * 10 + 1
        ? { name: `Angebot-${c.name.replace(/\W+/g, "-")}.txt`, data: Buffer.from(`Erfundenes Testdokument für ${c.name}.\n`) }
        : (testDocuments.get(customerId)?.find((d) => d.id === documentId) ?? null);
  } else {
    const customer = await getCustomer(customerId);
    doc = customer ? await getDocument(customer, documentId) : null;
  }
  if (!doc) return fail(res, 404, "Dieses Dokument gibt es nicht.");
  sendFile(res, doc);
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

const CUSTOMER_LABELS: Record<keyof CustomerValues, string> = { name: "Kunde", country: "Land", city: "Stadt", zip: "PLZ", address: "Adresse", email: "E-Mail" };

/** Änderungsverlauf Kunden: angelegt (nur neue Werte) bzw. alt → neu */
function customerChanges(before: Partial<CustomerValues> | null, after: CustomerValues): HistoryChange[] {
  return (Object.keys(CUSTOMER_LABELS) as (keyof CustomerValues)[])
    .filter((k) => String(before?.[k] ?? "") !== String(after[k] ?? "") && (before || after[k]))
    .map((k) => (before ? { label: CUSTOMER_LABELS[k], old: String(before[k] ?? ""), new: String(after[k] ?? "") } : { label: CUSTOMER_LABELS[k], new: String(after[k]) }));
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
        await recordChange(user.username, "kunden", newId, "angelegt", customerChanges(null, values));
        return json(res, 201, { id: newId } satisfies CustomerSaveResponse);
      }
      const current = testCustomers.find((c) => c.id === id);
      if (!current) throw new DbError("Diesen Kunden gibt es nicht.", 404);
      const extra = testExtra.get(id);
      const before = { name: current.name, city: current.city, country: extra?.country ?? "", zip: extra?.zip ?? "", address: extra?.address ?? "", email: extra?.email ?? "" };
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
      const changes = customerChanges(before, values);
      if (changes.length) await recordChange(user.username, "kunden", id, "geändert", changes);
      return json(res, 200, { id, renamed } satisfies CustomerSaveResponse);
    }
    if (id === undefined) {
      const newId = await createCustomer(values);
      log(`Kunde angelegt: ${newId} von ${user.username}`);
      await recordChange(user.username, "kunden", newId, "angelegt", customerChanges(null, values));
      return json(res, 201, { id: newId } satisfies CustomerSaveResponse);
    }
    const old = await getCustomer(id);
    const { renamed } = await updateCustomer(id, values);
    const changes = customerChanges(old, values);
    if (changes.length) await recordChange(user.username, "kunden", id, "geändert", changes);
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
      await recordChange(user.username, "kunden", id, "gelöscht", [{ label: "Kunde", old: c.name }]);
    } else {
      const old = await getCustomer(id);
      await deleteCustomer(id);
      await recordChange(user.username, "kunden", id, "gelöscht", old ? [{ label: "Kunde", old: old.name }] : []);
    }
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
    // Fehlt das Schema noch, erneut versuchen (z. B. gerade vom DB-Betrieb angelegt), sonst Hinweis statt Fehler
    if (!schemaState.ready && method === "GET") await initAdminStore();
    if (path === "/api/admin/logins" && method === "GET") json(res, 200, { items: schemaState.ready ? await listLogins() : [], schema: schemaState });
    else if (path === "/api/admin/roles" && method === "GET") json(res, 200, { items: schemaState.ready ? await listRoles() : [], areas: PERMISSION_AREAS, schema: schemaState });
    else if (path === "/api/admin/roles" && method === "POST") {
      const id = await saveRole(undefined, roleInput((await readJson(req)).role), user.username);
      log(`Rolle ${id} angelegt von ${user.username}`);
      json(res, 201, { id });
    } else if (roleId && method === "PUT") {
      await saveRole(Number(roleId), roleInput((await readJson(req)).role), user.username);
      log(`Rolle ${roleId} geändert von ${user.username}`);
      json(res, 200, { id: Number(roleId) });
    } else if (path === "/api/admin/settings" && method === "GET") {
      json(res, 200, settingsResponse());
    } else if (/^\/api\/admin\/settings\/(ldap|db|smtp)(\/test)?$/.test(path) && (method === "PUT" || method === "POST" || method === "DELETE")) {
      await changeSettings(req, res, path, method, user);
    } else if (path === "/api/admin/settings/smtp/testmail" && method === "POST") {
      await testMail(req, res, user);
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

// ---------- Einstellungen (LDAP, Datenbank, SMTP), nur Admins ----------

function settingsResponse(): SettingsResponse {
  return { sections: { ldap: settingsView("ldap"), db: settingsView("db"), smtp: settingsView("smtp") }, ...settingsMeta() };
}

/** Werte aus dem Formular prüfen und in die richtigen Typen bringen; Passwort getrennt */
function settingsInput(section: Section, body: Record<string, unknown>): { values: Record<string, string | number>; password?: string } {
  const def = SETTINGS_SECTIONS.find((s) => s.id === section)!;
  const raw = body.values && typeof body.values === "object" ? (body.values as Record<string, unknown>) : {};
  const values: Record<string, string | number> = {};
  for (const f of def.fields) {
    const v = raw[f.key];
    const text = typeof v === "number" ? String(v) : typeof v === "string" ? v.trim() : "";
    if (f.required && !text) throw new LoginError(`${f.label} ist ein Pflichtfeld.`, 400);
    if (text.length > 255) throw new LoginError(`${f.label}: höchstens 255 Zeichen.`, 400);
    if (f.type === "number") {
      const n = Number(text);
      if (!Number.isInteger(n) || n < 1 || n > 65535) throw new LoginError(`${f.label}: ungültige Zahl.`, 400);
      values[f.key] = n;
    } else if (f.type === "select") {
      if (!f.options?.some((o) => o.value === text)) throw new LoginError(`${f.label}: ungültige Auswahl.`, 400);
      values[f.key] = text;
    } else values[f.key] = text;
  }
  if (section === "ldap" && !/^ldaps?:\/\/[^\s/]+(:\d+)?\/?$/i.test(String(values.url))) throw new LoginError("Server-Adresse: ldaps://server:636 oder ldap://server:389.", 400);
  if (section === "smtp" && values.host && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(String(values.from))) throw new LoginError("Absenderadresse: gültige E-Mail-Adresse angeben.", 400);
  const password = body.password;
  if (password !== undefined && (typeof password !== "string" || password.length > 255)) throw new LoginError("Passwort: ungültiger Wert.", 400);
  return { values, password: def.password ? (password as string | undefined) : undefined };
}

/** Verbindungstest mit den angegebenen (noch nicht gespeicherten) Werten */
async function checkSettings(section: Section, next: AllSettings[Section]): Promise<CheckResult> {
  if (ENV.testMode) {
    if (section === "smtp" && !(next as SmtpSettings).host) return { ok: false, target: "(nicht eingerichtet)", error: "Kein SMTP-Server eingetragen." };
    return { ok: true, target: "Testmodus (keine Verbindung)", latencyMs: 0, detail: "Im Testmodus wird nur die Eingabe geprüft." };
  }
  if (section === "ldap") return ldapCheck(next as LdapSettings);
  if (section === "db") return dbCheck(next as DbSettings);
  return smtpCheck(next as SmtpSettings);
}

/**
 * POST …/<bereich>/test: nur prüfen. PUT …/<bereich>: prüfen und speichern (LDAP und Datenbank nur, wenn die
 * Verbindung klappt, sonst wären Anmeldung bzw. Daten weg). DELETE …/<bereich>: zurück auf die .env.
 */
async function changeSettings(req: IncomingMessage, res: ServerResponse, path: string, method: string, user: SessionUser): Promise<void> {
  const section = path.split("/")[4] as Section;
  const def = SETTINGS_SECTIONS.find((s) => s.id === section)!;
  if (method === "DELETE") {
    resetSettings(section, user.username);
    if (section === "db") await resetPool();
    log(`Einstellungen ${def.title}: auf .env zurückgesetzt von ${user.username}`);
    return json(res, 200, settingsResponse());
  }
  const input = settingsInput(section, await readJson(req));
  const next = candidate(section, input.values as never, input.password);
  const check = await checkSettings(section, next);
  if (path.endsWith("/test")) return json(res, 200, check);
  if (method !== "PUT") return fail(res, 404, "Unbekannte Adresse.");
  if (def.testRequired && !check.ok) return json(res, 409, { error: `Nicht gespeichert, die Verbindung klappt nicht: ${check.error ?? "unbekannter Fehler"}`, check });
  saveSettings(section, next, user.username);
  if (section === "db") {
    await resetPool();
    void initAdminStore();
  }
  log(`Einstellungen ${def.title}: geändert von ${user.username}${input.password !== undefined ? " (Passwort neu gesetzt)" : ""}`);
  json(res, 200, { ...settingsResponse(), check });
}

// Testmodus: „gesendete“ Test-Mails nur im Speicher
const testOutbox: { to: string; at: string }[] = [];

async function testMail(req: IncomingMessage, res: ServerResponse, user: SessionUser): Promise<void> {
  const body = await readJson(req);
  const to = typeof body.to === "string" ? body.to.trim() : "";
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(to) || to.length > 255) return fail(res, 400, "Empfänger: gültige E-Mail-Adresse angeben.");
  const smtp = settings("smtp");
  if (!smtp.host) return fail(res, 409, "Kein SMTP-Server eingetragen.");
  try {
    if (ENV.testMode) testOutbox.push({ to, at: new Date().toISOString() });
    else await sendMail(to, "CMDB: Test-Mail", `Diese Test-Mail hat ${user.displayName} (${user.username}) in der CMDB-Verwaltung ausgelöst.\n\nDer Mailversand der CMDB funktioniert.`);
    log(`Test-Mail an ${to} von ${user.username}${ENV.testMode ? " (Testmodus, nicht gesendet)" : ""}`);
    json(res, 200, { sent: true, testMode: ENV.testMode });
  } catch (e) {
    fail(res, 502, `Senden fehlgeschlagen: ${e instanceof Error ? e.message : String(e)}`);
  }
}

/** Original-Werte aus der Anfrage (was die Person beim Öffnen gesehen hat) */
function originalValues(raw: unknown): Record<string, string> {
  if (!raw || typeof raw !== "object") throw new LoginError("Ungültige Anfrage (Ausgangswerte fehlen).", 400);
  return Object.fromEntries(Object.entries(raw as Record<string, unknown>).map(([k, v]) => [k, typeof v === "string" ? v : String(v ?? "")]));
}

/** Nur den Status setzen (Auslaufende Kundensysteme): genau ein Feld „status“, Wert aus SYSTEM_STATUS oder leer */
function statusOnly(area: Area, raw: unknown): Record<string, string> | undefined {
  if (!raw || typeof raw !== "object" || Object.keys(raw).join() !== "status") return undefined;
  const v = (raw as Record<string, unknown>).status;
  if (!area.fields.some((f) => f.key === "status")) throw new LoginError("Dieser Bereich hat keinen Status.", 400);
  if (typeof v !== "string" || (v !== "" && !SYSTEM_STATUS.includes(v))) throw new LoginError("Status: ungültiger Wert.", 400);
  return { status: v };
}

/**
 * Eintrag bearbeiten (Recht Bearbeiten des Bereichs) oder mit status nur den Status setzen (PUT …/status, Recht
 * „Auslaufende Kundensysteme: Bearbeiten“). Über das normale Bearbeiten lässt sich der Status nicht setzen.
 */
async function editInArea(req: IncomingMessage, res: ServerResponse, area: Area, user: SessionUser, id: number, status = false, editable?: string[]): Promise<void> {
  const body = await readJson(req);
  try {
    const original = originalValues(body.original);
    const values = status
      ? (statusOnly(area, body.values) ?? (() => { throw new LoginError("Nur der Status kann hier gesetzt werden.", 400); })())
      : {
          ...validValues(area, body.values, ENV.testMode ? testForm(area) : await areaForm(area), original, editable),
          ...(!editable || (area.secret && editable.includes(area.secret.key)) ? secretValue(area, body.values, body.clearSecret === true) : {}),
        };
    let changed: string[];
    if (ENV.testMode) {
      const row = areaRows(area).find((r) => r.id === id);
      if (!row) throw new DbError(`Diesen Eintrag (${area.singular} ${id}) gibt es nicht.`, 404);
      const meanwhile = area.fields.filter((f) => f.key in values && String(row[f.key] ?? "") !== (original[f.key] ?? ""));
      if (meanwhile.length) throw new DbError(`Der Eintrag wurde inzwischen geändert (${meanwhile.map((f) => f.label).join(", ")}). Bitte neu laden und erneut bearbeiten.`, 409);
      changed = area.fields.filter((f) => f.key in values && values[f.key] !== String(row[f.key] ?? "")).map((f) => f.label);
      const { [area.secret?.key ?? ""]: secret, ...plain } = values;
      if (area.secret && secret !== undefined) {
        testSecrets.set(`${area.id}:${id}`, secret);
        changed.push(area.secret.label);
      }
      testEdits.set(`${area.id}:${id}`, { ...row, ...plain });
    } else changed = await updateAreaRow(area, id, values, original);
    log(`Geändert: ${area.singular} ${id} von ${user.username}${changed.length ? ` (${changed.join(", ")})` : " (keine Änderung)"}`);
    const changes = diff(area, original, values);
    if (changes.length) await recordChange(user.username, area.id, id, status ? "status" : "geändert", changes);
    json(res, 200, { id, changed });
  } catch (e) {
    if (!(e instanceof DbError)) throw e;
    log(`Ändern nicht möglich (${area.singular} ${id}, ${user.username}): ${e.message}`);
    fail(res, e.status, e.message);
  }
}

// ---------- PMS-Module am Oracle-ESL-Vertrag ----------

// Testmodus: Module im Speicher (bis zum Neustart)
let testPms: PmsModule[] | undefined;
let testPmsPrices: PmsPrice[] = TEST_PMS_PRICES.map((p) => ({ ...p }));
const testPmsState = () => (testPms ??= testPmsModules(areaRows(AREAS[PMS_AREA]).map((r) => r.id)));

/** Preise aus der Anfrage: je Spalte null oder 0 … PMS_PRICE_MAX mit höchstens zwei Nachkommastellen */
function pmsPrices(raw: unknown): PmsPrices {
  if (!raw || typeof raw !== "object") throw new LoginError("Ungültige Anfrage.", 400);
  const prices = {} as PmsPrices;
  for (const c of PMS_PRICE_COLUMNS) {
    const v = (raw as Record<string, unknown>)[c.key] ?? null;
    if (v !== null && (typeof v !== "number" || !Number.isFinite(v) || v < 0 || v > PMS_PRICE_MAX || Math.abs(Math.round(v * 100) - v * 100) > 1e-6))
      throw new LoginError(`${c.label}: ungültiger Betrag.`, 400);
    prices[c.key] = v;
  }
  return prices;
}

async function addPms(req: IncomingMessage, res: ServerResponse, user: SessionUser): Promise<void> {
  const body = await readJson(req);
  const contractId = Number(body.contractId);
  const module = typeof body.module === "string" ? body.module.trim() : "";
  if (!Number.isInteger(contractId) || contractId <= 0 || !module || module.length > 255) return fail(res, 400, "Ungültige Anfrage.");
  try {
    let id: number;
    if (ENV.testMode) {
      if (!areaRows(AREAS[PMS_AREA]).some((r) => r.id === contractId)) throw new DbError(`Diesen Vertrag (Oracle-ESL ${contractId}) gibt es nicht.`, 404);
      const price = testPmsPrices.find((p) => p.module === module);
      if (!price) throw new DbError(`„${module}“ steht nicht in der Preisliste.`, 400);
      if (testPmsState().some((m) => m.contractId === contractId && m.module === module)) throw new DbError(`${module} ist an Oracle-ESL ${contractId} schon vorhanden.`, 409);
      id = Math.max(0, ...testPmsState().map((m) => m.id)) + 1;
      testPms = [...testPmsState(), { ...price, id, contractId }];
    } else id = await addPmsModule(contractId, module);
    log(`PMS-Modul hinzugefügt: Oracle-ESL ${contractId} von ${user.username}`);
    await recordChange(user.username, PMS_AREA, contractId, "geändert", [{ label: "PMS-Modul hinzugefügt", new: module }]);
    json(res, 201, { id });
  } catch (e) {
    if (!(e instanceof DbError)) throw e;
    fail(res, e.status, e.message);
  }
}

/** Preise ändern oder Modul entfernen; body.original: Modul und Preise beim Öffnen */
async function changePms(req: IncomingMessage, res: ServerResponse, user: SessionUser, id: number, remove: boolean): Promise<void> {
  const body = await readJson(req);
  try {
    const raw = body.original as Record<string, unknown> | undefined;
    const original = { ...pmsPrices(raw), module: typeof raw?.module === "string" ? raw.module : "" };
    const prices = remove ? ("delete" as const) : pmsPrices(body.prices);
    let before: PmsModule;
    if (ENV.testMode) {
      const found = testPmsState().find((m) => m.id === id);
      if (!found) throw new DbError("Dieses PMS-Modul gibt es nicht mehr. Bitte neu laden.", 404);
      if (found.module !== original.module || !samePrices(found, original)) throw new DbError("Das PMS-Modul wurde inzwischen geändert. Bitte neu laden.", 409);
      before = found;
      testPms = prices === "delete" ? testPmsState().filter((m) => m.id !== id) : testPmsState().map((m) => (m.id === id ? { ...m, ...prices } : m));
    } else before = await changePmsModule(id, original, prices);
    const changes =
      prices === "delete"
        ? [{ label: "PMS-Modul entfernt", old: before.module }]
        : PMS_PRICE_COLUMNS.filter((c) => !samePrices({ ...before, [c.key]: prices[c.key] }, before)).map((c) => ({
            label: `${before.module}: ${c.label}`,
            old: euro(before[c.key]),
            new: euro(prices[c.key]),
          }));
    log(`PMS-Modul ${prices === "delete" ? "entfernt" : "geändert"}: Oracle-ESL ${before.contractId} von ${user.username}`);
    if (changes.length) await recordChange(user.username, PMS_AREA, before.contractId, "geändert", changes);
    res.writeHead(204, { "Cache-Control": "no-store" });
    res.end();
  } catch (e) {
    if (!(e instanceof DbError)) throw e;
    fail(res, e.status, e.message);
  }
}

/** Verwaltung › Stammdaten › PMS-Modularten: Preisliste pflegen (Rechte wie die übrigen Stammdaten) */
async function changePmsPrices(req: IncomingMessage, res: ServerResponse, method: string): Promise<void> {
  const action = method === "POST" ? "add" : method === "PUT" ? "edit" : "delete";
  const user = await allowedList(req, res, PMS_PRICE_LIST, action === "add" ? "create" : action);
  if (!user) return;
  const body = await readJson(req);
  const entry = (raw: unknown): PmsPrice => {
    const name = typeof (raw as { module?: unknown } | undefined)?.module === "string" ? (raw as { module: string }).module.trim() : "";
    if (!name) throw new LoginError("Bitte einen Namen für das Modul angeben.", 400);
    if (name.length > 255) throw new LoginError("Name: höchstens 255 Zeichen.", 400);
    return { module: name, ...pmsPrices(raw) };
  };
  try {
    const next = action === "delete" ? null : entry(body.entry);
    const original = action === "add" ? null : entry(body.original);
    let renamed = 0;
    if (ENV.testMode) {
      const has = (name: string) => testPmsPrices.some((p) => p.module === name);
      if (next && (action === "add" || next.module !== original?.module) && has(next.module)) throw new DbError(`„${next.module}“ steht schon in der Preisliste.`, 409);
      if (original) {
        const current = testPmsPrices.find((p) => p.module === original.module);
        if (!current) throw new DbError(`„${original.module}“ steht nicht mehr in der Preisliste. Bitte neu laden.`, 404);
        if (!samePrices(current, original)) throw new DbError(`„${original.module}“ wurde inzwischen geändert. Bitte neu laden.`, 409);
        const used = testPmsState().filter((m) => m.module === original.module).length;
        if (action === "delete" && used) throw new DbError(`„${original.module}“ hängt noch an ${used} Oracle-ESL-Vertr${used === 1 ? "ag" : "ägen"} und kann nicht gelöscht werden.`, 409);
        if (next && next.module !== original.module) {
          renamed = used;
          testPms = testPmsState().map((m) => (m.module === original.module ? { ...m, module: next.module } : m));
        }
      }
      testPmsPrices =
        action === "add" ? [...testPmsPrices, next!] : action === "delete" ? testPmsPrices.filter((p) => p.module !== original!.module) : testPmsPrices.map((p) => (p.module === original!.module ? next! : p));
    } else renamed = await changePmsPrice(action, next, original);
    const what = action === "add" ? `„${next!.module}“ hinzugefügt` : action === "delete" ? `„${original!.module}“ gelöscht` : `„${original!.module}“ geändert${renamed ? ` (an ${renamed} Verträgen umbenannt)` : ""}`;
    log(`PMS-Preisliste: ${what} von ${user.username}`);
    json(res, 200, { renamed });
  } catch (e) {
    if (!(e instanceof DbError)) throw e;
    fail(res, e.status, e.message);
  }
}

// ---------- Support-Ende je Betriebssystem ----------

// Testmodus: im Speicher, vorbelegt wie die Migration
let testOsSupport: OsSupportEntry[] = OS_SUPPORT_SEED.map((e) => ({ ...e }));

/** Support-Daten; fehlt das Schema oder die Tabelle noch, ohne Ableitung weiter */
async function osSupport(): Promise<OsSupportEntry[]> {
  if (ENV.testMode) return testOsSupport;
  try {
    return await listOsSupport();
  } catch {
    return [];
  }
}

/** Windows-Systeme: Support bis und EOL aus dem Betriebssystem, wenn am System nichts steht */
async function decorate(area: Area, rows: AreaRow[]): Promise<AreaRow[]> {
  return area.id === "windows" ? withOsSupport(rows, await osSupport()) : rows;
}

async function changeOsSupport(req: IncomingMessage, res: ServerResponse): Promise<void> {
  const user = await allowedList(req, res, LOOKUP_LISTS.find((l) => l.id === "server-os")!, "edit");
  if (!user) return;
  const body = await readJson(req);
  const name = typeof body.name === "string" ? body.name.trim() : "";
  const date = (v: unknown) => (typeof v === "string" ? v.trim() : "");
  const mainstreamEnd = date(body.mainstreamEnd);
  const extendedEnd = date(body.extendedEnd);
  if (!name || name.length > 255) return fail(res, 400, "Betriebssystem fehlt.");
  for (const v of [mainstreamEnd, extendedEnd]) if (v && (!/^\d{4}-\d{2}-\d{2}$/.test(v) || Number.isNaN(Date.parse(v)))) return fail(res, 400, "Ungültiges Datum.");
  if (mainstreamEnd && extendedEnd && mainstreamEnd > extendedEnd) return fail(res, 400, "Das LTS-Ende liegt vor dem Ende des allgemeinen Supports.");
  try {
    if (ENV.testMode) testOsSupport = [...testOsSupport.filter((e) => e.name !== name), { name, mainstreamEnd, extendedEnd, changedBy: user.username }];
    else await saveOsSupport(name, mainstreamEnd, extendedEnd, user.username);
    log(`Support-Ende ${name}: ${mainstreamEnd || "–"} / LTS ${extendedEnd || "–"} von ${user.username}`);
    json(res, 200, { items: await osSupport() });
  } catch (e) {
    if (!(e instanceof DbError)) throw e;
    fail(res, e.status, e.message);
  }
}

// Testmodus: Stammdaten im Speicher
const testLookups = new Map<string, string[]>(LOOKUP_LISTS.map((l) => [l.id, [...(TEST_OPTIONS[l.testKey] ?? [])]]));

async function stammdaten(): Promise<StammdatenResponse> {
  const lists = await Promise.all(
    LOOKUP_LISTS.map(async (l) => {
      if (ENV.testMode) return { id: l.id, label: l.label, maxLength: l.maxLength, values: [...(testLookups.get(l.id) ?? [])].sort((a, b) => a.localeCompare(b, "de")) };
      try {
        return { id: l.id, label: l.label, maxLength: l.maxLength, values: await lookupValues(l) };
      } catch (e) {
        return { id: l.id, label: l.label, maxLength: l.maxLength, values: [], error: e instanceof Error ? e.message : String(e) };
      }
    }),
  );
  return { lists };
}

/** Stammdaten ändern: POST hinzufügen, PUT umbenennen ({old, value}), DELETE löschen ({value}) */
async function changeStammdaten(req: IncomingMessage, res: ServerResponse, listId: string, method: string): Promise<void> {
  const list = LOOKUP_LISTS.find((l) => l.id === listId);
  if (!list) return fail(res, 404, "Unbekannte Liste.");
  const action = method === "POST" ? "add" : method === "PUT" ? "rename" : "delete";
  const user = await allowedList(req, res, list, action === "add" ? "create" : action === "rename" ? "edit" : "delete");
  if (!user) return;
  const body = await readJson(req);
  const value = typeof body.value === "string" ? body.value.trim() : "";
  const old = typeof body.old === "string" ? body.old.trim() : undefined;
  if (!value) return fail(res, 400, "Bitte einen Wert angeben.");
  if (value.length > list.maxLength) return fail(res, 400, `Höchstens ${list.maxLength} Zeichen.`);
  try {
    if (ENV.testMode) {
      const values = testLookups.get(list.id) ?? [];
      const has = (v: string) => values.includes(v);
      if (action === "add" && has(value)) throw new DbError(`„${value}“ steht schon in der Liste ${list.label}.`, 409);
      if (action === "rename" && (!old || !has(old))) throw new DbError(`„${old ?? ""}“ steht nicht in der Liste ${list.label}.`, 404);
      if (action === "rename" && value !== old && has(value)) throw new DbError(`„${value}“ steht schon in der Liste ${list.label}.`, 409);
      if (action === "delete" && !has(value)) throw new DbError(`„${value}“ steht nicht in der Liste ${list.label}.`, 404);
      testLookups.set(list.id, action === "add" ? [...values, value] : action === "rename" ? values.map((v) => (v === old ? value : v)) : values.filter((v) => v !== value));
    } else await changeLookup(list, action, value, old);
    if (list.id === "server-os" && action !== "add") {
      const from = action === "rename" ? old! : value;
      const to = action === "rename" ? value : null;
      if (ENV.testMode) testOsSupport = to === null ? testOsSupport.filter((e) => e.name !== from) : testOsSupport.map((e) => (e.name === from && !testOsSupport.some((x) => x.name === to) ? { ...e, name: to } : e));
      else await followOsRename(from, to);
    }
    log(`Stammdaten ${list.label}: ${action === "add" ? `„${value}“ hinzugefügt` : action === "rename" ? `„${old}“ → „${value}“` : `„${value}“ gelöscht`} von ${user.username}`);
    json(res, 200, await stammdaten());
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
      const user = sessionFromRequest(req);
      if (!area?.createFields) fail(res, 404, "Dieser Bereich kann nicht angelegt werden.");
      else if (!user) fail(res, 401, "Nicht angemeldet.");
      else {
        // Auswahllisten fürs Formular: zum Anlegen oder Bearbeiten (auch nur eine Feldgruppe)
        const permissions = await permissionsFor(user);
        if (!can(permissions, area.id, "create") && !editableFields(area, (a, action) => can(permissions, a, action)).length)
          fail(res, 403, `Keine Berechtigung (${area.plural ?? area.singular}: Anlegen).`);
        else await readDb(res, async () => (ENV.testMode ? testForm(area) : await areaForm(area)));
      }
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
    } else if (/^\/api\/areas\/[a-z-]+\/\d+$/.test(path) && method === "PUT") {
      const [, , , areaId, rawId] = path.split("/");
      const area = Object.hasOwn(AREAS, areaId) ? AREAS[areaId] : undefined;
      const user = sessionFromRequest(req);
      if (!user) fail(res, 401, "Nicht angemeldet.");
      else if (!area?.createFields) fail(res, 404, "Dieser Bereich kann nicht bearbeitet werden.");
      else {
        // Recht Bearbeiten des Bereichs (alle Felder) oder einer Feldgruppe (nur deren Felder)
        const permissions = await permissionsFor(user);
        const editable = editableFields(area, (a, action) => can(permissions, a, action));
        if (!editable.length) fail(res, 403, `Keine Berechtigung (${area.plural ?? area.singular}: Bearbeiten).`);
        else await editInArea(req, res, area, user, Number(rawId), false, editable);
      }
    } else if (/^\/api\/areas\/[a-z-]+\/\d+\/documents(\/\d+)?$/.test(path) && (method === "GET" || method === "POST")) {
      const [, , , areaId, rawId, , rawDoc] = path.split("/");
      const area = Object.hasOwn(AREAS, areaId) ? AREAS[areaId] : undefined;
      if (!area?.createFields || area.noDocuments || (method === "POST" && rawDoc)) fail(res, sessionFromRequest(req) ? 404 : 401, sessionFromRequest(req) ? "Unbekannte Adresse." : "Nicht angemeldet.");
      else await systemDocuments(req, res, area, Number(rawId), rawDoc ? Number(rawDoc) : undefined, method);
    } else if (/^\/api\/areas\/[a-z-]+\/\d+$/.test(path) && method === "DELETE") {
      const [, , , areaId, rawId] = path.split("/");
      const area = Object.hasOwn(AREAS, areaId) ? AREAS[areaId] : undefined;
      if (!area?.createFields || area.noDelete) fail(res, sessionFromRequest(req) ? 404 : 401, sessionFromRequest(req) ? "Dieser Bereich kann nicht gelöscht werden." : "Nicht angemeldet.");
      else {
        const user = await allowed(req, res, area.id, "delete");
        if (user) await deleteInArea(req, res, area, user, Number(rawId));
      }
    } else if (/^\/api\/areas\/[a-z-]+\/\d+\/status$/.test(path) && method === "PUT") {
      const [, , , areaId, rawId] = path.split("/");
      const area = Object.hasOwn(AREAS, areaId) ? AREAS[areaId] : undefined;
      if (!area?.createFields) fail(res, sessionFromRequest(req) ? 404 : 401, sessionFromRequest(req) ? "Unbekannte Adresse." : "Nicht angemeldet.");
      else {
        const user = await allowed(req, res, "auslaufend", "edit");
        if (user) await editInArea(req, res, area, user, Number(rawId), true);
      }
    } else if (/^\/api\/areas\/[a-z-]+\/\d+\/secret$/.test(path) && method === "GET") {
      const [, , , areaId, rawId] = path.split("/");
      const area = Object.hasOwn(AREAS, areaId) ? AREAS[areaId] : undefined;
      if (!area?.secret) fail(res, sessionFromRequest(req) ? 404 : 401, sessionFromRequest(req) ? "Dieser Bereich hat kein Passwort." : "Nicht angemeldet.");
      else {
        const user = await allowed(req, res, area.id, "edit");
        if (user) await sendSecret(res, area, Number(rawId), user);
      }
    } else if (/^\/api\/areas\/[a-z-]+(\/\d+)?$/.test(path) && method === "GET") {
      const [, , , areaId, rawId] = path.split("/");
      const area = Object.hasOwn(AREAS, areaId) ? AREAS[areaId] : undefined;
      if (!area) fail(res, sessionFromRequest(req) ? 404 : 401, sessionFromRequest(req) ? "Unbekannter Bereich." : "Nicht angemeldet.");
      else if (!(await allowed(req, res, area.id, "read"))) return true;
      else if (rawId === undefined)
        await readDb(res, async () => ({ source: ENV.testMode ? "test" : "db", items: await decorate(area, ENV.testMode ? areaRows(area) : await listArea(area)) }) satisfies AreaListResponse);
      else
        await readDb(res, async () => {
          const id = Number(rawId);
          const row: AreaRow | null | undefined = ENV.testMode ? areaRows(area).find((r) => r.id === id) : await getAreaRow(area, id);
          if (!row) throw new DbError(`Diesen Eintrag (${area.singular} ${id}) gibt es nicht.`, 404);
          return (await decorate(area, [row]))[0];
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
    } else if (/^\/api\/customers\/\d+\/documents$/.test(path) && method === "POST") {
      const user = await allowed(req, res, "kunden", "edit");
      if (user) await uploadDocument(req, res, Number(path.split("/")[3]), user);
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
    } else if (/^\/api\/history\/[a-z-]+\/\d+$/.test(path) && method === "GET") {
      const [, , , areaId, rawId] = path.split("/");
      if (areaId !== "kunden" && !Object.hasOwn(AREAS, areaId)) fail(res, 404, "Unbekannter Bereich.");
      else if (await allowed(req, res, areaId, "read")) {
        try {
          json(res, 200, { items: await listChanges(areaId, Number(rawId)), available: true } satisfies HistoryResponse);
        } catch {
          // Schema/Tabelle noch nicht da: leerer Verlauf statt Fehler
          json(res, 200, { items: [], available: false } satisfies HistoryResponse);
        }
      }
    } else if (path === "/api/pms-module" && method === "GET") {
      if (await allowed(req, res, PMS_AREA, "read"))
        await readDb(res, async () =>
          (ENV.testMode
            ? { source: "test", items: testPmsState(), prices: testPmsPrices }
            : { source: "db", ...(await listPms()) }) satisfies PmsResponse,
        );
    } else if (path === "/api/pms-preisliste" && ["POST", "PUT", "DELETE"].includes(method)) {
      await changePmsPrices(req, res, method);
    } else if (path === "/api/pms-module" && method === "POST") {
      const user = await allowed(req, res, PMS_WRITE, "create");
      if (user) await addPms(req, res, user);
    } else if (/^\/api\/pms-module\/\d+$/.test(path) && (method === "PUT" || method === "DELETE")) {
      const user = await allowed(req, res, PMS_WRITE, method === "PUT" ? "edit" : "delete");
      if (user) await changePms(req, res, user, Number(path.split("/")[3]), method === "DELETE");
    } else if (path === "/api/os-support" && method === "GET") {
      if (!sessionFromRequest(req)) fail(res, 401, "Nicht angemeldet.");
      else json(res, 200, { items: await osSupport() });
    } else if (path === "/api/os-support" && method === "PUT") {
      await changeOsSupport(req, res);
    } else if (path === "/api/stammdaten" && method === "GET") {
      if (await allowed(req, res, "stammdaten", "read")) json(res, 200, await stammdaten());
    } else if (/^\/api\/stammdaten\/[a-z-]+$/.test(path) && ["POST", "PUT", "DELETE"].includes(method)) {
      await changeStammdaten(req, res, path.split("/")[3], method);
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
