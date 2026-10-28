/**
 * Zugriff auf die SQL-Server-Datenbank, nur lesend. Bestehende dbo-Tabellen werden nie verändert (siehe CLAUDE.md).
 */
import sql from "mssql";
import type { Area, AreaFormResponse, AreaRow } from "@/lib/areas";
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
  if (number === 229 || number === 230) {
    const write = /\b(UPDATE|INSERT|DELETE)\b/.test(String((e as Error).message));
    return new DbError(`Die CMDB darf ${object} noch nicht ${write ? "ändern (Schreibrecht" : "lesen (Leserecht"} für den Datenbank-Login fehlt).`, 503);
  }
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

/** Tabellen- und Spaltennamen stammen nur aus der festen Beschreibung in src/lib/areas.ts, nie aus Anfragen */
const quote = (name: string) => `[${name.replace(/]/g, "]]")}]`;

function areaSelect(area: Area): string {
  return ["ID", ...area.fields.map((f) => `${quote(f.column)} AS ${quote(f.key)}`)].join(", ");
}

// Vorab angelegte Leerzeilen gehören nicht zum Bestand. Sie sind nicht ganz leer (z. B. EOL ist vorbelegt),
// haben aber weder Typ noch Firma; so zählt auch GAPTEQ (Server 64, Switche 34)
function areaNotEmpty(area: Area): string {
  const columns = area.fields.filter((f) => f.key === "type" || f.key === "company").map((f) => f.column);
  return "(" + columns.map((c) => `NULLIF(LTRIM(RTRIM(${quote(c)})), '') IS NOT NULL`).join(" OR ") + ")";
}

function toAreaRow(area: Area, r: Record<string, unknown>): AreaRow {
  const row: AreaRow = { id: Number(r.ID) };
  for (const f of area.fields) {
    const v = r[f.key];
    // date → Date um Mitternacht UTC → JJJJ-MM-TT
    row[f.key] = v instanceof Date ? v.toISOString().slice(0, 10) : String(v ?? "").trim();
  }
  return row;
}

export async function listArea(area: Area): Promise<AreaRow[]> {
  try {
    const result = await (await pool()).request().query(`SELECT ${areaSelect(area)} FROM dbo.${quote(area.table)} WHERE ${areaNotEmpty(area)} ORDER BY ID`);
    return result.recordset.map((r) => toAreaRow(area, r));
  } catch (e) {
    throw translate(e, `dbo.${area.table}`);
  }
}

/**
 * Neuer Eintrag wie in GAPTEQ: Die nächste freie, vorab angelegte Leerzeile des Bereichs wird gefüllt.
 * Die Zeile wird beim Auswählen gesperrt (UPDLOCK), gesperrte Zeilen anderer Vorgänge übersprungen (READPAST),
 * und geschrieben wird nur, solange sie noch leer ist. Hat sie in der Zwischenzeit jemand belegt, nimmt die CMDB
 * die nächste. Es werden nur Spalten aus der festen Beschreibung des Bereichs gesetzt.
 */
export async function createAreaRow(area: Area, values: Record<string, string>): Promise<number> {
  const table = `dbo.${quote(area.table)}`;
  const free = `NOT ${areaNotEmpty(area)}`;
  const p = await pool();
  for (let attempt = 0; attempt < 3; attempt++) {
    const tx = new sql.Transaction(p);
    await tx.begin(sql.ISOLATION_LEVEL.READ_COMMITTED);
    try {
      const pick = await new sql.Request(tx).query<{ ID: number }>(`SELECT TOP 1 ID FROM ${table} WITH (UPDLOCK, ROWLOCK, READPAST) WHERE ${free} ORDER BY ID`);
      const id = pick.recordset[0]?.ID;
      if (id === undefined) throw new DbError(`Im Bereich ${area.singular} ist keine freie Zeile mehr vorhanden.`, 409);
      const request = new sql.Request(tx).input("id", sql.Int, id);
      const sets: string[] = [];
      for (const [i, f] of area.fields.entries()) {
        if (f.key !== "type" && !(f.key in values)) continue;
        const value = f.key === "type" ? area.typeValue : values[f.key].trim();
        request.input(`v${i}`, f.date ? sql.Date : sql.NVarChar(255), value === "" ? null : f.date ? new Date(`${value}T00:00:00Z`) : value);
        sets.push(`${quote(f.column)} = @v${i}`);
      }
      const update = await request.query(`UPDATE ${table} SET ${sets.join(", ")} WHERE ID = @id AND ${free}`);
      if (update.rowsAffected[0] !== 1) {
        await tx.rollback();
        continue;
      }
      await tx.commit();
      return id;
    } catch (e) {
      await tx.rollback().catch(() => undefined);
      throw translate(e, table.replace(/[[\]]/g, ""));
    }
  }
  throw new DbError("Die freie Zeile wurde gerade anderweitig belegt. Bitte noch einmal speichern.", 409);
}

/** Formular „Anlage“: voraussichtliche nächste freie ID (ohne Sperre, nur zur Anzeige) und Auswahllisten */
export async function areaForm(area: Area): Promise<AreaFormResponse> {
  const p = await pool();
  const options: Record<string, string[]> = {};
  let object = `dbo.${area.table}`;
  try {
    const next = await p.request().query<{ ID: number | null }>(`SELECT MIN(ID) AS ID FROM dbo.${quote(area.table)} WHERE NOT ${areaNotEmpty(area)}`);
    for (const f of area.fields) {
      if (!f.options || !area.createFields?.includes(f.key)) continue;
      if (f.options === "customers") {
        object = "dbo.DS_Kunden";
        options[f.key] = (await listCustomers()).map((c) => c.name).filter(Boolean);
      } else {
        object = `dbo.${f.options.table}`;
        const column = quote(f.options.column);
        const result = await p.request().query<{ v: string }>(
          `SELECT DISTINCT LTRIM(RTRIM(${column})) AS v FROM dbo.${quote(f.options.table)} WHERE NULLIF(LTRIM(RTRIM(${column})), '') IS NOT NULL ORDER BY v`,
        );
        options[f.key] = result.recordset.map((r) => r.v);
      }
    }
    return { nextId: next.recordset[0]?.ID ?? null, options };
  } catch (e) {
    throw translate(e, object);
  }
}

export async function getAreaRow(area: Area, id: number): Promise<AreaRow | null> {
  try {
    const result = await (await pool()).request().input("id", sql.Int, id).query(`SELECT ${areaSelect(area)} FROM dbo.${quote(area.table)} WHERE ID = @id`);
    return result.recordset[0] ? toAreaRow(area, result.recordset[0]) : null;
  } catch (e) {
    throw translate(e, `dbo.${area.table}`);
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
