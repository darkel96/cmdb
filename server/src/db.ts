/**
 * Verbindungstest zur SQL-Server-Datenbank. Phase 0 liest keine Daten: nur Version, Datenbank und Login.
 * Bestehende dbo-Tabellen werden nie verändert (siehe CLAUDE.md).
 */
import sql from "mssql";
import type { CheckResult } from "@/lib/types";
import { DB_CA, ENV } from "./env";

function target(): string {
  return ENV.dbServer ? `${ENV.dbServer}:${ENV.dbPort}/${ENV.dbName}` : "(nicht eingerichtet)";
}

export async function dbCheck(): Promise<CheckResult> {
  if (!ENV.dbServer || !ENV.dbUser) return { ok: false, target: target(), error: "CMDB_DB_SERVER und CMDB_DB_USER sind nicht gesetzt." };
  const started = Date.now();
  const pool = new sql.ConnectionPool({
    server: ENV.dbServer,
    port: ENV.dbPort,
    database: ENV.dbName,
    user: ENV.dbUser,
    password: ENV.dbPassword,
    connectionTimeout: 8000,
    requestTimeout: 8000,
    pool: { max: 1, min: 0 },
    options: {
      encrypt: true,
      trustServerCertificate: ENV.dbTrustServerCert,
      ...(DB_CA ? { cryptoCredentialsDetails: { ca: [DB_CA] } } : {}),
    },
  });
  try {
    await pool.connect();
    const result = await pool.request().query<{ version: string; db: string; login: string }>(
      "SELECT CAST(SERVERPROPERTY('ProductVersion') AS nvarchar(32)) AS version, DB_NAME() AS db, SUSER_SNAME() AS login",
    );
    const row = result.recordset[0];
    return { ok: true, target: target(), latencyMs: Date.now() - started, detail: `SQL Server ${row.version} · Datenbank ${row.db} · Login ${row.login}` };
  } catch (e) {
    return { ok: false, target: target(), latencyMs: Date.now() - started, error: e instanceof Error ? e.message : String(e) };
  } finally {
    await pool.close().catch(() => undefined);
  }
}
