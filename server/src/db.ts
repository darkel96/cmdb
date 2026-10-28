/**
 * Zugriff auf die SQL-Server-Datenbank, nur lesend. Bestehende dbo-Tabellen werden nie verändert (siehe CLAUDE.md).
 */
import sql from "mssql";
import type { CheckResult, Customer } from "@/lib/types";
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
