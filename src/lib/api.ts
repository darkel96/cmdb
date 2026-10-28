/**
 * Zugriff auf den CMDB-Dienst. Im Build-Modus „pages“ (VITE_TESTMODE=1) gibt es keinen Dienst:
 * Dann beantwortet eine Attrappe im Browser alle Anfragen mit den Testbenutzern und erfundenen Daten.
 */
import type { CiListResponse, CustomerListResponse, HealthResponse, MeResponse, Server, ServerListResponse } from "./types";
import { TEST_CIS, TEST_CUSTOMERS, TEST_PASSWORD, TEST_SERVERS, TEST_USERS } from "./testData";

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
  servers(): Promise<ServerListResponse>;
  server(id: number): Promise<Server>;
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
  servers: () => request<ServerListResponse>("/api/servers"),
  server: (id) => request<Server>(`/api/servers/${id}`),
};

const STORAGE_KEY = "cmdb-test-session";

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
  servers: async () => {
    if (!storedUser()) throw new ApiError("Nicht angemeldet.", 401);
    return { source: "test", items: TEST_SERVERS };
  },
  server: async (id) => {
    if (!storedUser()) throw new ApiError("Nicht angemeldet.", 401);
    const server = TEST_SERVERS.find((s) => s.id === id);
    if (!server) throw new ApiError("Diesen Server gibt es nicht.", 404);
    return server;
  },
};

/** Testmodus im Browser ohne Dienst (GitHub Pages) */
export const BROWSER_TEST_MODE = import.meta.env.VITE_TESTMODE === "1";

export const api: Api = BROWSER_TEST_MODE ? browserTestApi : serverApi;
