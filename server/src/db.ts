/**
 * Zugriff auf die SQL-Server-Datenbank, nur lesend. Bestehende dbo-Tabellen werden nie verändert (siehe CLAUDE.md).
 */
import sql from "mssql";
import type { CheckResult, Customer, Server } from "@/lib/types";
import { DB_CA, ENV } from "./env";

export class DbError extends Error {
  constructor(message: string, readonly status: number) {
    super(message);
  }
}

function target(): string {
  return ENV.dbServer ? `${ENV.dbServer}:${ENV.dbPort}/${ENV.dbName}` : "(nicht eingerichtet)";
}

function config(max: number): sql.config {
  return {
    server: ENV.dbServer,
    port: ENV.dbPort,
    database: ENV.dbName,
    user: ENV.dbUser,
    password: ENV.dbPassword,
    connectionTimeout: 8000,
    requestTimeout: 15000,
    pool: { max, min: 0, idleTimeoutMillis: 60_000 },
    options: {
      encrypt: true,
      trustServerCertificate: ENV.dbTrustServerCert,
      ...(DB_CA ? { cryptoCredentialsDetails: { ca: [DB_CA] } } : {}),
    },
  };
}

let shared: Promise<sql.ConnectionPool> | undefined;

/** Gemeinsamer Pool für Abfragen; nach einem Verbindungsfehler wird beim nächsten Aufruf neu verbunden */
function pool(): Promise<sql.ConnectionPool> {
  if (!ENV.dbServer || !ENV.dbUser) return Promise.reject(new DbError("Die Datenbank ist nicht eingerichtet.", 503));
  shared ??= new sql.ConnectionPool(config(5)).connect().catch((e) => {
    shared = undefined;
    throw e;
  });
  return shared;
}

/** Fehlermeldungen von SQL Server in verständliche Hinweise übersetzen (ohne Verbindungsdetails) */
function translate(e: unknown, object: string): DbError {
  const number = (e as { number?: number }).number;
  if (number === 229 || number === 230) return new DbError(`Die CMDB darf ${object} noch nicht lesen (Leserecht für den Datenbank-Login fehlt).`, 503);
  if (number === 208) return new DbError(`${object} gibt es in der Datenbank nicht.`, 503);
  if (e instanceof DbError) return e;
  return new DbError("Die Datenbank ist gerade nicht erreichbar.", 503);
}

export async function listCustomers(): Promise<Customer[]> {
  try {
    const result = await (await pool()).request().query<{ ExportId: number; Kunde: string | null; Stadt: string | null }>(
      "SELECT ExportId, Kunde, Stadt FROM dbo.DS_Kunden ORDER BY Kunde",
    );
    return result.recordset.map((r) => ({ id: r.ExportId, name: (r.Kunde ?? "").trim(), city: (r.Stadt ?? "").trim() }));
  } catch (e) {
    throw translate(e, "dbo.DS_Kunden");
  }
}

const text = (v: string | null | undefined) => (v ?? "").trim();

/** Datum aus SQL Server (date → Date um Mitternacht UTC) als JJJJ-MM-TT */
function isoDate(v: Date | null): string | null {
  return v ? v.toISOString().slice(0, 10) : null;
}

interface ServerRow {
  ID: number; Typ: string | null; Firma: string | null; Bestellnummer: string | null; Lieferant: string | null;
  Hersteller: string | null; Modell: string | null; Servertyp: string | null; Servicetag: string | null;
  Wartungstyp: string | null; Support_bis: Date | null; Besonderheiten: string | null; Lieferdatum: Date | null;
  EOL: string | null; Status: string | null;
}

const SERVER_COLUMNS = "ID, Typ, Firma, Bestellnummer, Lieferant, Hersteller, Modell, Servertyp, Servicetag, Wartungstyp, Support_bis, Besonderheiten, Lieferdatum, EOL, Status";
// Vorab angelegte Leerzeilen (ohne Firma, Modell und Servicetag) gehören nicht zum Bestand
const SERVER_NOT_EMPTY = "(NULLIF(LTRIM(RTRIM(Firma)), '') IS NOT NULL OR NULLIF(LTRIM(RTRIM(Modell)), '') IS NOT NULL OR NULLIF(LTRIM(RTRIM(Servicetag)), '') IS NOT NULL)";

function toServer(r: ServerRow): Server {
  return {
    id: r.ID, type: text(r.Typ), company: text(r.Firma), orderNumber: text(r.Bestellnummer), supplier: text(r.Lieferant),
    manufacturer: text(r.Hersteller), model: text(r.Modell), serverType: text(r.Servertyp), serviceTag: text(r.Servicetag),
    maintenanceType: text(r.Wartungstyp), supportUntil: isoDate(r.Support_bis), notes: text(r.Besonderheiten),
    deliveredOn: isoDate(r.Lieferdatum), eol: text(r.EOL), status: text(r.Status),
  };
}

export async function listServers(): Promise<Server[]> {
  try {
    const result = await (await pool()).request().query<ServerRow>(`SELECT ${SERVER_COLUMNS} FROM dbo.Server_manuell WHERE ${SERVER_NOT_EMPTY} ORDER BY ID`);
    return result.recordset.map(toServer);
  } catch (e) {
    throw translate(e, "dbo.Server_manuell");
  }
}

export async function getServer(id: number): Promise<Server | null> {
  try {
    const result = await (await pool()).request().input("id", sql.Int, id).query<ServerRow>(`SELECT ${SERVER_COLUMNS} FROM dbo.Server_manuell WHERE ID = @id`);
    return result.recordset[0] ? toServer(result.recordset[0]) : null;
  } catch (e) {
    throw translate(e, "dbo.Server_manuell");
  }
}

/** Verbindungstest mit eigener Verbindung: nur Version, Datenbank und Login */
export async function dbCheck(): Promise<CheckResult> {
  if (!ENV.dbServer || !ENV.dbUser) return { ok: false, target: target(), error: "CMDB_DB_SERVER und CMDB_DB_USER sind nicht gesetzt." };
  const started = Date.now();
  const check = new sql.ConnectionPool(config(1));
  try {
    await check.connect();
    const result = await check.request().query<{ version: string; db: string; login: string }>(
      "SELECT CAST(SERVERPROPERTY('ProductVersion') AS nvarchar(32)) AS version, DB_NAME() AS db, SUSER_SNAME() AS login",
    );
    const row = result.recordset[0];
    return { ok: true, target: target(), latencyMs: Date.now() - started, detail: `SQL Server ${row.version} · Datenbank ${row.db} · Login ${row.login}` };
  } catch (e) {
    return { ok: false, target: target(), latencyMs: Date.now() - started, error: e instanceof Error ? e.message : String(e) };
  } finally {
    await check.close().catch(() => undefined);
  }
}
