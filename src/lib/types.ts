/** Gemeinsame Typen für Frontend und Dienst */

export type Role = "admin" | "user";

export interface SessionUser {
  /** Anmeldename (sAMAccountName), klein geschrieben */
  username: string;
  displayName: string;
  mail: string;
  role: Role;
}

export interface MeResponse {
  user: SessionUser;
  testMode: boolean;
}

export interface CheckResult {
  ok: boolean;
  /** Ziel der Prüfung, z. B. LDAP-Adresse oder Server/Datenbank */
  target: string;
  latencyMs?: number;
  detail?: string;
  error?: string;
}

export interface HealthResponse {
  status: "ok";
  version: string;
  testMode: boolean;
  /** Nur für Admins */
  details?: {
    ldap: CheckResult;
    db: CheckResult;
    uptimeSeconds: number;
  };
}

export interface Customer {
  /** ExportId aus dbo.DS_Kunden */
  id: number;
  name: string;
  city: string;
}

export interface CustomerListResponse {
  /** "test" = erfundene Daten (Testmodus), "db" = dbo.DS_Kunden (nur lesend) */
  source: "test" | "db";
  items: Customer[];
}

/** Eintrag aus dbo.Server_manuell; Datumswerte als ISO-Text (JJJJ-MM-TT) */
export interface Server {
  id: number;
  type: string;
  company: string;
  orderNumber: string;
  supplier: string;
  manufacturer: string;
  model: string;
  serverType: string;
  serviceTag: string;
  maintenanceType: string;
  supportUntil: string | null;
  notes: string;
  deliveredOn: string | null;
  eol: string;
  status: string;
}

export interface ServerListResponse {
  source: "test" | "db";
  items: Server[];
}

export interface CiListResponse {
  /** "test" = erfundene Daten (Testmodus), "none" = Datenanbindung folgt in Phase 1 */
  source: "test" | "none";
  items: ConfigurationItem[];
}

export interface ConfigurationItem {
  id: number;
  name: string;
  type: string;
  company: string;
  manufacturer: string;
  model: string;
  status: "Aktiv" | "Geplant" | "Ausser Betrieb";
  supportUntil: string;
}
