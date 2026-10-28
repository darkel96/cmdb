/**
 * Zugriff auf den CMDB-Dienst. Im Build-Modus „pages“ (VITE_TESTMODE=1) gibt es keinen Dienst:
 * Dann beantwortet eine Attrappe im Browser alle Anfragen mit den Testbenutzern und erfundenen Daten.
 */
import { AREAS, type AreaCreateResponse, type AreaFormResponse, type AreaListResponse, type AreaRow, type CustomerDetailResponse, type CustomerSaveResponse, type CustomerValuesRequest } from "./areas";
import type { CiListResponse, CustomerListResponse, HealthResponse, MeResponse } from "./types";
import { TEST_CIS, TEST_COUNTRIES, TEST_CUSTOMERS, TEST_OPTIONS, TEST_PASSWORD, TEST_USERS, testRows } from "./testData";

export class ApiError extends Error {
  constructor(message: string, readonly status: number) {
    super(message);
  }
}

export interface Api {
  login(username: string, password: string): Promise<MeResponse>;
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
  customer(id: number): Promise<CustomerDetailResponse>;
  /** Adresse zum Herunterladen eines Anhangs; null = auf der Testseite nicht verfügbar */
  documentUrl(customerId: number, documentId: number): string | null;
  createCustomer(values: CustomerValuesRequest["values"]): Promise<CustomerSaveResponse>;
  updateCustomer(id: number, values: CustomerValuesRequest["values"]): Promise<CustomerSaveResponse>;
  deleteCustomer(id: number): Promise<void>;
}

async function request<T>(path: string, init?: RequestInit): Promise<T> {
  const res = await fetch(path, { credentials: "same-origin", ...init, headers: { Accept: "application/json", ...(init?.body ? { "Content-Type": "application/json" } : {}), ...init?.headers } });
  if (res.status === 204) return undefined as T;
  const body = await res.json().catch(() => ({}));
  if (!res.ok) throw new ApiError(typeof body.error === "string" ? body.error : `Fehler ${res.status}`, res.status);
  return body as T;
}

const serverApi: Api = {
  login: (username, password) => request<MeResponse>("/api/login", { method: "POST", body: JSON.stringify({ username, password }) }),
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
  areaRow: (areaId, id) => request<AreaRow>(`/api/areas/${areaId}/${id}`),
  areaForm: (areaId) => request<AreaFormResponse>(`/api/areas/${areaId}/form`),
  createAreaRow: (areaId, values) => request<AreaCreateResponse>(`/api/areas/${areaId}`, { method: "POST", body: JSON.stringify({ values }) }),
  customer: (id) => request<CustomerDetailResponse>(`/api/customers/${id}`),
  documentUrl: (customerId, documentId) => `/api/customers/${customerId}/documents/${documentId}`,
  createCustomer: (values) => request<CustomerSaveResponse>("/api/customers", { method: "POST", body: JSON.stringify({ values }) }),
  updateCustomer: (id, values) => request<CustomerSaveResponse>(`/api/customers/${id}`, { method: "PUT", body: JSON.stringify({ values }) }),
  // Leerer JSON-Inhalt, damit die Ursprungsprüfung des Dienstes greift
  deleteCustomer: (id) => request<void>(`/api/customers/${id}`, { method: "DELETE", body: "{}" }),
};

const STORAGE_KEY = "cmdb-test-session";

// Testseite: neu angelegte Einträge nur bis zum Neuladen
const browserCreated = new Map<string, AreaRow[]>();
let browserCustomers = [...TEST_CUSTOMERS];
const browserRenames = new Map<string, string>();
const browserExtra = new Map<number, { country: string; zip: string; address: string; email: string }>();
const renamed = (name: string) => {
  let current = name;
  for (let i = 0; i < 10 && browserRenames.has(current); i++) current = browserRenames.get(current)!;
  return current;
};
const browserRows = (areaId: string) =>
  [...testRows(AREAS[areaId]), ...(browserCreated.get(areaId) ?? [])].map((r) => (typeof r.company === "string" ? { ...r, company: renamed(r.company) } : r));
const requireAdmin = () => {
  if (storedUser()?.user.role !== "admin") throw new ApiError("Nur Admins.", 403);
};

function storedUser(): MeResponse | null {
  try {
    const name = sessionStorage.getItem(STORAGE_KEY);
    return name && TEST_USERS[name] ? { user: TEST_USERS[name], testMode: true } : null;
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
    return { user, testMode: true };
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
        ? { details: { ldap: { ok: true, target: "Testmodus (kein LDAP)", latencyMs: 0, detail: "Testbenutzer admin und user" }, db: { ok: true, target: "Testmodus (keine Datenbank)", latencyMs: 0, detail: "Erfundene Daten" }, uptimeSeconds: 0 } }
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
    return { source: "test", items: browserRows(areaId) };
  },
  areaRow: async (areaId, id) => {
    if (!storedUser()) throw new ApiError("Nicht angemeldet.", 401);
    const row = browserRows(areaId).find((r) => r.id === id);
    if (!row) throw new ApiError("Diesen Eintrag gibt es nicht.", 404);
    return row;
  },
  areaForm: async (areaId) => {
    if (storedUser()?.user.role !== "admin") throw new ApiError("Anlegen dürfen nur Admins.", 403);
    const area = AREAS[areaId];
    const options: Record<string, string[]> = {};
    for (const f of area.fields) {
      if (f.options && area.createFields?.includes(f.key)) options[f.key] = f.options === "customers" ? browserCustomers.map((c) => c.name) : (TEST_OPTIONS[f.key] ?? []);
    }
    return { nextId: Math.max(...browserRows(areaId).map((r) => r.id)) + 1, options };
  },
  createAreaRow: async (areaId, values) => {
    if (storedUser()?.user.role !== "admin") throw new ApiError("Anlegen dürfen nur Admins.", 403);
    const area = AREAS[areaId];
    const row: AreaRow = { id: Math.max(...browserRows(areaId).map((r) => r.id)) + 1 };
    for (const f of area.fields) row[f.key] = f.key === "type" ? area.typeValue : (values[f.key] ?? "");
    browserCreated.set(areaId, [...(browserCreated.get(areaId) ?? []), row]);
    return { id: row.id };
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
    return { customer: { ...c, ...extra }, documents: [], systems, errors: {}, source: "test" };
  },
  documentUrl: () => null,
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
