/**
 * Zugriff auf den CMDB-Dienst. Im Build-Modus „pages“ (VITE_TESTMODE=1) gibt es keinen Dienst:
 * Dann beantwortet eine Attrappe im Browser alle Anfragen mit den Testbenutzern und erfundenen Daten.
 */
import { AREAS, type AreaCreateResponse, type AreaFormResponse, type AreaListResponse, type AreaRow } from "./areas";
import type { CiListResponse, CustomerListResponse, HealthResponse, MeResponse } from "./types";
import { TEST_CIS, TEST_CUSTOMERS, TEST_PASSWORD, TEST_USERS, testRows } from "./testData";

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
};

const STORAGE_KEY = "cmdb-test-session";

// Testseite: neu angelegte Einträge nur bis zum Neuladen
const browserCreated = new Map<string, AreaRow[]>();
const browserRows = (areaId: string) => [...testRows(AREAS[areaId]), ...(browserCreated.get(areaId) ?? [])];
const BROWSER_OPTIONS: Record<string, string[]> = {
  supplier: ["Lieferant A", "Lieferant B"],
  manufacturer: ["Hersteller A", "Hersteller B", "Hersteller C"],
  serverType: ["Multi Site Cluster", "Single Server", "Single Site Cluster", "Windows Cluster"],
  maintenanceType: ["Garantie", "Wartungsvertrag"],
  eol: ["Ja", "Nein"],
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
    return { source: "test", items: TEST_CUSTOMERS };
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
      if (f.options && area.createFields?.includes(f.key)) options[f.key] = f.options === "customers" ? TEST_CUSTOMERS.map((c) => c.name) : (BROWSER_OPTIONS[f.key] ?? []);
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
};

/** Testmodus im Browser ohne Dienst (GitHub Pages) */
export const BROWSER_TEST_MODE = import.meta.env.VITE_TESTMODE === "1";

export const api: Api = BROWSER_TEST_MODE ? browserTestApi : serverApi;
