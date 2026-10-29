/**
 * Zugriff auf den CMDB-Dienst. Im Build-Modus „pages“ (VITE_TESTMODE=1) gibt es keinen Dienst:
 * Dann beantwortet eine Attrappe im Browser alle Anfragen mit den Testbenutzern und erfundenen Daten.
 */
import { AREAS, firstFreeId, type AreaCreateResponse, type AreaFormResponse, type AreaListResponse, type AreaRow, type CustomerDocument, type CustomerDetailResponse, type CustomerSaveResponse, type CustomerValuesRequest } from "./areas";
import type { SettingsInput, SettingsResponse, SettingsSectionId } from "./settings";
import { OS_SUPPORT_SEED, withOsSupport, type OsSupportEntry } from "./osSupport";
import { READ_ALL, allPermissions, PERMISSION_AREAS, type Action, type LoginLogEntry, type Role } from "./permissions";
import { LOOKUP_LISTS, type StammdatenResponse } from "./stammdaten";
import type { CheckResult, CiListResponse, CustomerListResponse, HealthResponse, MeResponse } from "./types";
import { TEST_CIS, TEST_COUNTRIES, TEST_CUSTOMERS, TEST_OPTIONS, TEST_PASSWORD, TEST_USERS, testRows } from "./testData";

export class ApiError extends Error {
  constructor(message: string, readonly status: number) {
    super(message);
  }
}

export interface Api {
  /** remember: „Angemeldet bleiben“ (längere Sitzung) */
  login(username: string, password: string, remember?: boolean): Promise<MeResponse>;
  logout(): Promise<void>;
  /** null = nicht angemeldet */
  me(): Promise<MeResponse | null>;
  health(): Promise<HealthResponse>;
  cis(): Promise<CiListResponse>;
  customers(): Promise<CustomerListResponse>;
  area(areaId: string): Promise<AreaListResponse>;
  areaRow(areaId: string, id: number): Promise<AreaRow>;
  areaForm(areaId: string): Promise<AreaFormResponse>;
  createAreaRow(areaId: string, values: Record<string, string>): Promise<AreaCreateResponse>;
  /** clearSecret: Passwort des Eintrags (area.secret) entfernen */
  /** Eintrag löschen (Recht Löschen); original: Werte beim Öffnen */
  deleteAreaRow(areaId: string, id: number, original: Record<string, string>): Promise<void>;
  /** Status setzen (Auslaufende Kundensysteme, Recht dort Bearbeiten) */
  setStatus(areaId: string, id: number, status: string, original: string): Promise<{ id: number; changed: string[] }>;
  updateAreaRow(areaId: string, id: number, values: Record<string, string>, original: Record<string, string>, clearSecret?: boolean): Promise<{ id: number; changed: string[] }>;
  customer(id: number): Promise<CustomerDetailResponse>;
  /** Adresse zum Herunterladen eines Anhangs; null = auf der Testseite nicht verfügbar */
  documentUrl(customerId: number, documentId: number): string | null;
  /** Support-Ende je Betriebssystem (Stammdaten › Server-OS) */
  osSupport(): Promise<{ items: OsSupportEntry[] }>;
  saveOsSupport(entry: OsSupportEntry): Promise<{ items: OsSupportEntry[] }>;
  /** Dokumente eines Systems (wie GAPTEQ: dbo.Anhang, Vertrag_ID = ID) */
  systemDocuments(areaId: string, id: number): Promise<{ documents: CustomerDocument[] }>;
  systemDocumentUrl(areaId: string, id: number, documentId: number): string | null;
  uploadSystemDocument(areaId: string, id: number, file: File): Promise<{ id: number }>;
  /** Dokument direkt am Kunden hochladen (wie GAPTEQ: dbo.Anhang, Typ „Angebot“) */
  uploadDocument(customerId: number, file: File): Promise<{ id: number }>;
  /** Passwort eines Eintrags (z. B. Oracle RMAN), nur mit dem Recht Bearbeiten */
  areaSecret(areaId: string, id: number): Promise<{ value: string }>;
  createCustomer(values: CustomerValuesRequest["values"]): Promise<CustomerSaveResponse>;
  updateCustomer(id: number, values: CustomerValuesRequest["values"]): Promise<CustomerSaveResponse>;
  deleteCustomer(id: number): Promise<void>;
  adminLogins(): Promise<AdminLoginsResponse>;
  /** Einstellungen LDAP, Datenbank, SMTP (nur Admins) */
  settings(): Promise<SettingsResponse>;
  testSettings(section: SettingsSectionId, input: SettingsInput): Promise<CheckResult>;
  saveSettings(section: SettingsSectionId, input: SettingsInput): Promise<SettingsResponse & { check: CheckResult }>;
  resetSettings(section: SettingsSectionId): Promise<SettingsResponse>;
  testMail(to: string): Promise<{ sent: boolean; testMode: boolean }>;
  adminRoles(): Promise<AdminRolesResponse>;
  saveRole(id: number | undefined, role: RoleInput): Promise<{ id: number }>;
  deleteRole(id: number): Promise<void>;
  stammdaten(): Promise<StammdatenResponse>;
  /** Wert hinzufügen (add), umbenennen (rename, mit old) oder löschen (delete) */
  changeLookup(listId: string, action: "add" | "rename" | "delete", value: string, old?: string): Promise<StammdatenResponse>;
}

export interface SchemaState {
  ready: boolean;
  error?: string;
}

export interface AdminLoginsResponse {
  items: LoginLogEntry[];
  schema: SchemaState;
}

export interface AdminRolesResponse {
  items: Role[];
  areas: { id: string; label: string; actions?: Action[] }[];
  schema: SchemaState;
}

export type RoleInput = Pick<Role, "name" | "description" | "permissions" | "members">;

/** Größte Datei für Kunden-Dokumente, wie im Dienst */
export const MAX_DOCUMENT_MB = 15;

async function toBase64(file: File): Promise<string> {
  const bytes = new Uint8Array(await file.arrayBuffer());
  let binary = "";
  // In Blöcken, damit grosse Dateien den Aufruf-Stapel nicht sprengen
  for (let i = 0; i < bytes.length; i += 0x8000) binary += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
  return btoa(binary);
}

async function request<T>(path: string, init?: RequestInit): Promise<T> {
  const res = await fetch(path, { credentials: "same-origin", ...init, headers: { Accept: "application/json", ...(init?.body ? { "Content-Type": "application/json" } : {}), ...init?.headers } });
  if (res.status === 204) return undefined as T;
  const body = await res.json().catch(() => ({}));
  if (!res.ok) throw new ApiError(typeof body.error === "string" ? body.error : `Fehler ${res.status}`, res.status);
  return body as T;
}

const serverApi: Api = {
  login: (username, password, remember) => request<MeResponse>("/api/login", { method: "POST", body: JSON.stringify({ username, password, remember }) }),
  logout: () => request<void>("/api/logout", { method: "POST", body: "{}" }),
  me: async () => {
    try {
      return await request<MeResponse>("/api/me");
    } catch (e) {
      if (e instanceof ApiError && e.status === 401) return null;
      throw e;
    }
  },
  health: () => request<HealthResponse>("/api/health"),
  cis: () => request<CiListResponse>("/api/cis"),
  customers: () => request<CustomerListResponse>("/api/customers"),
  area: (areaId) => request<AreaListResponse>(`/api/areas/${areaId}`),
  osSupport: () => request<{ items: OsSupportEntry[] }>("/api/os-support"),
  saveOsSupport: (entry) => request<{ items: OsSupportEntry[] }>("/api/os-support", { method: "PUT", body: JSON.stringify(entry) }),
  areaRow: (areaId, id) => request<AreaRow>(`/api/areas/${areaId}/${id}`),
  areaForm: (areaId) => request<AreaFormResponse>(`/api/areas/${areaId}/form`),
  createAreaRow: (areaId, values) => request<AreaCreateResponse>(`/api/areas/${areaId}`, { method: "POST", body: JSON.stringify({ values }) }),
  deleteAreaRow: (areaId, id, original) => request<void>(`/api/areas/${areaId}/${id}`, { method: "DELETE", body: JSON.stringify({ original }) }),
  setStatus: (areaId, id, status, original) =>
    request<{ id: number; changed: string[] }>(`/api/areas/${areaId}/${id}/status`, { method: "PUT", body: JSON.stringify({ values: { status }, original: { status: original } }) }),
  updateAreaRow: (areaId, id, values, original, clearSecret) =>
    request<{ id: number; changed: string[] }>(`/api/areas/${areaId}/${id}`, { method: "PUT", body: JSON.stringify({ values, original, ...(clearSecret ? { clearSecret } : {}) }) }),
  customer: (id) => request<CustomerDetailResponse>(`/api/customers/${id}`),
  documentUrl: (customerId, documentId) => `/api/customers/${customerId}/documents/${documentId}`,
  systemDocuments: (areaId, id) => request<{ documents: CustomerDocument[] }>(`/api/areas/${areaId}/${id}/documents`),
  systemDocumentUrl: (areaId, id, documentId) => `/api/areas/${areaId}/${id}/documents/${documentId}`,
  uploadSystemDocument: async (areaId, id, file) =>
    request<{ id: number }>(`/api/areas/${areaId}/${id}/documents`, { method: "POST", body: JSON.stringify({ name: file.name, data: await toBase64(file) }) }),
  uploadDocument: async (customerId, file) =>
    request<{ id: number }>(`/api/customers/${customerId}/documents`, { method: "POST", body: JSON.stringify({ name: file.name, data: await toBase64(file) }) }),
  areaSecret: (areaId, id) => request<{ value: string }>(`/api/areas/${areaId}/${id}/secret`),
  createCustomer: (values) => request<CustomerSaveResponse>("/api/customers", { method: "POST", body: JSON.stringify({ values }) }),
  updateCustomer: (id, values) => request<CustomerSaveResponse>(`/api/customers/${id}`, { method: "PUT", body: JSON.stringify({ values }) }),
  // Leerer JSON-Inhalt, damit die Ursprungsprüfung des Dienstes greift
  deleteCustomer: (id) => request<void>(`/api/customers/${id}`, { method: "DELETE", body: "{}" }),
  adminLogins: () => request<AdminLoginsResponse>("/api/admin/logins"),
  settings: () => request<SettingsResponse>("/api/admin/settings"),
  testSettings: (section, input) => request<CheckResult>(`/api/admin/settings/${section}/test`, { method: "POST", body: JSON.stringify(input) }),
  saveSettings: (section, input) => request<SettingsResponse & { check: CheckResult }>(`/api/admin/settings/${section}`, { method: "PUT", body: JSON.stringify(input) }),
  resetSettings: (section) => request<SettingsResponse>(`/api/admin/settings/${section}`, { method: "DELETE", body: "{}" }),
  testMail: (to) => request<{ sent: boolean; testMode: boolean }>("/api/admin/settings/smtp/testmail", { method: "POST", body: JSON.stringify({ to }) }),
  adminRoles: () => request<AdminRolesResponse>("/api/admin/roles"),
  saveRole: (id, role) =>
    request<{ id: number }>(id === undefined ? "/api/admin/roles" : `/api/admin/roles/${id}`, { method: id === undefined ? "POST" : "PUT", body: JSON.stringify({ role }) }),
  deleteRole: (id) => request<void>(`/api/admin/roles/${id}`, { method: "DELETE", body: "{}" }),
  stammdaten: () => request<StammdatenResponse>("/api/stammdaten"),
  changeLookup: (listId, action, value, old) =>
    request<StammdatenResponse>(`/api/stammdaten/${listId}`, { method: action === "add" ? "POST" : action === "rename" ? "PUT" : "DELETE", body: JSON.stringify({ value, old }) }),
};

const STORAGE_KEY = "cmdb-test-session";

// Testseite: neu angelegte Einträge nur bis zum Neuladen
const browserCreated = new Map<string, AreaRow[]>();
let browserOsSupport: OsSupportEntry[] = OS_SUPPORT_SEED.map((e) => ({ ...e }));
// Windows-Systeme: Support bis/EOL aus dem Betriebssystem wie im Dienst
const browserDecorated = (areaId: string) => (areaId === "windows" ? withOsSupport(browserRows(areaId), browserOsSupport) : browserRows(areaId));
// Testseite: Einstellungen nur im Speicher, erfundene Adressen
const BROWSER_SETTINGS_DEFAULT: SettingsResponse["sections"] = {
  ldap: { values: { url: "ldaps://dc.example.loc:636", domain: "example.loc", netbios: "EXAMPLE", baseDn: "OU=Mitarbeiter,DC=example,DC=loc", adminGroup: "" }, changed: [], passwordSet: false },
  db: { values: { server: "sql.example.loc", port: 1433, database: "CMDB", user: "svc_cmdb" }, changed: [], passwordSet: true },
  smtp: { values: { host: "", port: 587, security: "starttls", user: "", from: "", fromName: "CMDB" }, changed: [], passwordSet: false },
};
const browserSettings: SettingsResponse["sections"] = structuredClone(BROWSER_SETTINGS_DEFAULT);
const browserDeleted = new Set<string>();
const browserDocuments = new Map<number, { id: number; name: string }[]>();
const browserSystemDocuments = new Map<string, { id: number; name: string }[]>();
let browserCustomers = [...TEST_CUSTOMERS];
const browserRenames = new Map<string, string>();
const browserExtra = new Map<number, { country: string; zip: string; address: string; email: string }>();
const renamed = (name: string) => {
  let current = name;
  for (let i = 0; i < 10 && browserRenames.has(current); i++) current = browserRenames.get(current)!;
  return current;
};
const browserEdits = new Map<string, AreaRow>();
const browserRows = (areaId: string) =>
  [...new Map([...testRows(AREAS[areaId]), ...(browserCreated.get(areaId) ?? [])].map((r) => [r.id, r])).values()]
    .filter((r) => !browserDeleted.has(`${areaId}:${r.id}`))
    .map((r) => browserEdits.get(`${areaId}:${r.id}`) ?? r)
    .map((r) => (typeof r.company === "string" ? { ...r, company: renamed(r.company) } : r));
const browserLookups = new Map<string, string[]>(LOOKUP_LISTS.map((l) => [l.id, [...(TEST_OPTIONS[l.testKey] ?? [])]]));
const browserStammdaten = (): StammdatenResponse => ({
  lists: LOOKUP_LISTS.map((l) => ({ id: l.id, label: l.label, maxLength: l.maxLength, values: [...(browserLookups.get(l.id) ?? [])].sort((a, b) => a.localeCompare(b, "de")) })),
});
let browserRoles: Role[] = [{ id: 1, name: "Alle Angemeldeten", description: "Gilt für jede angemeldete Person", isDefault: true, permissions: READ_ALL, members: [] }];
const requireAdmin = () => {
  if (storedUser()?.user.role !== "admin") throw new ApiError("Nur Admins.", 403);
};

function storedUser(): MeResponse | null {
  try {
    const name = sessionStorage.getItem(STORAGE_KEY);
    return name && TEST_USERS[name] ? { user: TEST_USERS[name], testMode: true, permissions: TEST_USERS[name].role === "admin" ? allPermissions() : READ_ALL } : null;
  } catch {
    return null;
  }
}

const browserTestApi: Api = {
  login: async (username, password) => {
    const user = TEST_USERS[username.trim().toLowerCase()];
    if (!user || password !== TEST_PASSWORD) throw new ApiError("Benutzername oder Passwort falsch.", 401);
    try {
      sessionStorage.setItem(STORAGE_KEY, user.username);
    } catch {
      /* ohne Speicher gilt die Anmeldung nur bis zum Neuladen */
    }
    return { user, testMode: true, permissions: user.role === "admin" ? allPermissions() : READ_ALL };
  },
  logout: async () => {
    try {
      sessionStorage.removeItem(STORAGE_KEY);
    } catch {
      /* nichts zu tun */
    }
  },
  me: async () => storedUser(),
  health: async () => {
    const admin = storedUser()?.user.role === "admin";
    return {
      status: "ok",
      version: "pages",
      testMode: true,
      ...(admin
        ? {
            details: {
              ldap: { ok: true, target: "Testmodus (kein LDAP)", latencyMs: 0, detail: "Testbenutzer admin und user" },
              db: { ok: true, target: "Testmodus (keine Datenbank)", latencyMs: 0, detail: "Erfundene Daten" },
              smtp: browserSettings.smtp.values.host
                ? { ok: true, target: `${browserSettings.smtp.values.host}:${browserSettings.smtp.values.port}`, latencyMs: 0, detail: "Testseite: Mails werden nicht gesendet" }
                : { ok: false, target: "(nicht eingerichtet)", error: "Kein SMTP-Server eingetragen." },
              uptimeSeconds: 0,
            },
          }
        : {}),
    };
  },
  cis: async () => {
    if (!storedUser()) throw new ApiError("Nicht angemeldet.", 401);
    return { source: "test", items: TEST_CIS };
  },
  customers: async () => {
    if (!storedUser()) throw new ApiError("Nicht angemeldet.", 401);
    return { source: "test", items: browserCustomers };
  },
  area: async (areaId) => {
    if (!storedUser()) throw new ApiError("Nicht angemeldet.", 401);
    return { source: "test", items: browserDecorated(areaId) };
  },
  osSupport: async () => ({ items: browserOsSupport }),
  saveOsSupport: async (entry) => {
    requireAdmin();
    browserOsSupport = [...browserOsSupport.filter((e) => e.name !== entry.name), entry];
    return { items: browserOsSupport };
  },
  areaRow: async (areaId, id) => {
    if (!storedUser()) throw new ApiError("Nicht angemeldet.", 401);
    const row = browserDecorated(areaId).find((r) => r.id === id);
    if (!row) throw new ApiError("Diesen Eintrag gibt es nicht.", 404);
    return row;
  },
  areaForm: async (areaId) => {
    if (storedUser()?.user.role !== "admin") throw new ApiError("Anlegen dürfen nur Admins.", 403);
    const area = AREAS[areaId];
    const options: Record<string, string[]> = {};
    for (const f of area.fields) {
      if (!f.options || !area.createFields?.includes(f.key)) continue;
      const list = typeof f.options === "object" ? LOOKUP_LISTS.find((l) => l.table === (f.options as { table: string }).table) : undefined;
      options[f.key] = f.options === "customers" ? browserCustomers.map((c) => c.name) : list ? [...(browserLookups.get(list.id) ?? [])] : (TEST_OPTIONS[f.key] ?? []);
    }
    return { nextId: firstFreeId(AREAS[areaId], browserRows(areaId).map((r) => r.id)), options };
  },
  createAreaRow: async (areaId, values) => {
    if (storedUser()?.user.role !== "admin") throw new ApiError("Anlegen dürfen nur Admins.", 403);
    const area = AREAS[areaId];
    const row: AreaRow = { id: firstFreeId(area, browserRows(areaId).map((r) => r.id)) };
    for (const f of area.fields) row[f.key] = f.key === "type" ? area.typeValue : (values[f.key] ?? "");
    browserDeleted.delete(`${areaId}:${row.id}`);
    browserEdits.delete(`${areaId}:${row.id}`);
    browserCreated.set(areaId, [...(browserCreated.get(areaId) ?? []).filter((r) => r.id !== row.id), row]);
    return { id: row.id };
  },
  deleteAreaRow: async (areaId, id) => {
    requireAdmin();
    if (!browserRows(areaId).some((r) => r.id === id)) throw new ApiError("Diesen Eintrag gibt es nicht.", 404);
    browserDeleted.add(`${areaId}:${id}`);
  },
  setStatus: async (areaId, id, status) => browserTestApi.updateAreaRow(areaId, id, { status }, {}),
  updateAreaRow: async (areaId, id, values) => {
    requireAdmin();
    const row = browserRows(areaId).find((r) => r.id === id);
    if (!row) throw new ApiError("Diesen Eintrag gibt es nicht.", 404);
    const changed = AREAS[areaId].fields.filter((f) => f.key in values && values[f.key] !== String(row[f.key] ?? "")).map((f) => f.label);
    browserEdits.set(`${areaId}:${id}`, { ...row, ...values });
    return { id, changed };
  },
  customer: async (id) => {
    if (!storedUser()) throw new ApiError("Nicht angemeldet.", 401);
    const c = browserCustomers.find((x) => x.id === id);
    if (!c) throw new ApiError("Diesen Kunden gibt es nicht.", 404);
    const systems: Record<string, AreaRow[]> = {};
    for (const areaId of Object.keys(AREAS)) {
      const rows = browserRows(areaId).filter((r) => r.company === c.name);
      if (rows.length) systems[areaId] = rows;
    }
    const extra = browserExtra.get(id) ?? { country: TEST_COUNTRIES[id % TEST_COUNTRIES.length], zip: "", address: "", email: "" };
    const documents = (browserDocuments.get(id) ?? []).map((d) => ({ ...d, type: "Angebot" }));
    return { customer: { ...c, ...extra }, documents, systems, errors: {}, source: "test" };
  },
  documentUrl: () => null,
  systemDocuments: async (areaId, id) => ({ documents: (browserSystemDocuments.get(`${areaId}:${id}`) ?? []).map((d) => ({ ...d, type: AREAS[areaId].typeValue })) }),
  systemDocumentUrl: () => null,
  uploadSystemDocument: async (areaId, id, file) => {
    requireAdmin();
    const key = `${areaId}:${id}`;
    const docId = 950_000 + [...browserSystemDocuments.values()].flat().length + 1;
    browserSystemDocuments.set(key, [...(browserSystemDocuments.get(key) ?? []), { id: docId, name: file.name }]);
    return { id: docId };
  },
  uploadDocument: async (customerId, file) => {
    requireAdmin();
    const id = 900_000 + [...browserDocuments.values()].flat().length + 1;
    browserDocuments.set(customerId, [...(browserDocuments.get(customerId) ?? []), { id, name: file.name }]);
    return { id };
  },
  areaSecret: async (_areaId, id) => {
    requireAdmin();
    return { value: `Test-${id}-Kennwort` };
  },
  createCustomer: async (values) => {
    requireAdmin();
    if (browserCustomers.some((c) => c.name.toLowerCase() === values.name.trim().toLowerCase())) throw new ApiError(`Den Kunden „${values.name}“ gibt es schon.`, 409);
    const id = Math.max(...browserCustomers.map((c) => c.id)) + 1;
    browserCustomers = [...browserCustomers, { id, name: values.name.trim(), city: values.city }].sort((a, b) => a.name.localeCompare(b.name, "de"));
    browserExtra.set(id, { country: values.country, zip: "", address: "", email: "" });
    return { id };
  },
  updateCustomer: async (id, values) => {
    requireAdmin();
    const current = browserCustomers.find((c) => c.id === id);
    if (!current) throw new ApiError("Diesen Kunden gibt es nicht.", 404);
    const name = values.name.trim();
    if (browserCustomers.some((c) => c.id !== id && c.name.toLowerCase() === name.toLowerCase())) throw new ApiError(`Den Kunden „${name}“ gibt es schon.`, 409);
    const result: { label: string; count: number }[] = [];
    if (name !== current.name) {
      for (const area of Object.values(AREAS)) {
        const count = browserRows(area.id).filter((r) => r.company === current.name).length;
        if (count) result.push({ label: area.plural ?? area.singular, count });
      }
      browserRenames.set(current.name, name);
    }
    browserCustomers = browserCustomers.map((c) => (c.id === id ? { ...c, name, city: values.city } : c));
    browserExtra.set(id, { country: values.country, zip: values.zip ?? "", address: values.address ?? "", email: values.email ?? "" });
    return { id, renamed: result };
  },
  stammdaten: async () => browserStammdaten(),
  changeLookup: async (listId, action, value, old) => {
    requireAdmin();
    const values = browserLookups.get(listId) ?? [];
    if (action !== "delete" && values.includes(value) && value !== old) throw new ApiError(`„${value}“ steht schon in der Liste.`, 409);
    browserLookups.set(listId, action === "add" ? [...values, value] : action === "rename" ? values.map((v) => (v === old ? value : v)) : values.filter((v) => v !== value));
    return browserStammdaten();
  },
  settings: async () => {
    requireAdmin();
    return { sections: structuredClone(browserSettings) };
  },
  testSettings: async () => {
    requireAdmin();
    return { ok: true, target: "Testseite (keine Verbindung)", latencyMs: 0, detail: "Auf der Testseite wird nur die Eingabe geprüft." };
  },
  saveSettings: async (section, input) => {
    requireAdmin();
    const s = browserSettings[section];
    s.values = { ...input.values };
    s.changed = Object.keys(input.values);
    if (input.password !== undefined) s.passwordSet = input.password !== "";
    return { sections: structuredClone(browserSettings), check: { ok: true, target: "Testseite", latencyMs: 0 } };
  },
  resetSettings: async (section) => {
    requireAdmin();
    browserSettings[section] = structuredClone(BROWSER_SETTINGS_DEFAULT[section]);
    return { sections: structuredClone(browserSettings) };
  },
  testMail: async () => {
    requireAdmin();
    if (!browserSettings.smtp.values.host) throw new ApiError("Kein SMTP-Server eingetragen.", 409);
    return { sent: true, testMode: true };
  },
  adminLogins: async () => {
    requireAdmin();
    return { items: [], schema: { ready: true } };
  },
  adminRoles: async () => {
    requireAdmin();
    return { items: browserRoles, areas: PERMISSION_AREAS, schema: { ready: true } };
  },
  saveRole: async (id, role) => {
    requireAdmin();
    const newId = id ?? Math.max(0, ...browserRoles.map((r) => r.id)) + 1;
    const existing = browserRoles.find((r) => r.id === id);
    const next: Role = { ...role, id: newId, isDefault: existing?.isDefault ?? false, name: existing?.isDefault ? existing.name : role.name };
    browserRoles = id === undefined ? [...browserRoles, next] : browserRoles.map((r) => (r.id === id ? next : r));
    return { id: newId };
  },
  deleteRole: async (id) => {
    requireAdmin();
    browserRoles = browserRoles.filter((r) => r.id !== id || r.isDefault);
  },
  deleteCustomer: async (id) => {
    requireAdmin();
    const c = browserCustomers.find((x) => x.id === id);
    if (!c) throw new ApiError("Diesen Kunden gibt es nicht.", 404);
    const used = Object.keys(AREAS).some((areaId) => browserRows(areaId).some((r) => r.company === c.name));
    if (used) throw new ApiError("Löschen nicht möglich, dem Kunden sind noch Systeme zugeordnet.", 409);
    browserCustomers = browserCustomers.filter((x) => x.id !== id);
  },
};

/** Testmodus im Browser ohne Dienst (GitHub Pages) */
export const BROWSER_TEST_MODE = import.meta.env.VITE_TESTMODE === "1";

export const api: Api = BROWSER_TEST_MODE ? browserTestApi : serverApi;
