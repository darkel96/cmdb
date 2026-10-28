/**
 * Zugriff auf die SQL-Server-Datenbank, nur lesend. Bestehende dbo-Tabellen werden nie verändert (siehe CLAUDE.md).
 */
import sql from "mssql";
import type { Area, AreaFormResponse, AreaRow, CustomerDocument } from "@/lib/areas";
import type { CheckResult, Customer } from "@/lib/types";
import { CUSTOMER_LINKS } from "./customerLinks";
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
// haben aber weder Typ noch Firma; so zählt auch GAPTEQ (Server 64, Switche 34). Ohne Typ-Spalte zählt nur die Firma.
function areaNotEmpty(area: Area): string {
  const columns = area.fields.filter((f) => f.key === "type" || f.key === "company").map((f) => f.column);
  return "(" + columns.map((c) => `NULLIF(LTRIM(RTRIM(${quote(c)})), '') IS NOT NULL`).join(" OR ") + ")";
}

/** Spalte mit dem Kunden: meist Firma, bei Vertragsdaten Kunde */
function companyColumn(area: Area): string {
  return area.fields.find((f) => f.key === "company")?.column ?? "Firma";
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

export interface CustomerRecord {
  id: number;
  name: string;
  country: string;
  city: string;
  zip: string;
  address: string;
  email: string;
}

export type CustomerValues = Omit<CustomerRecord, "id">;

export async function getCustomer(id: number): Promise<CustomerRecord | null> {
  try {
    const result = await (await pool())
      .request()
      .input("id", sql.Int, id)
      .query<Record<string, string | number | null>>("SELECT ExportId, Kunde, Land, Stadt, PLZ, Adresse, [E-Mail] AS Mail FROM dbo.DS_Kunden WHERE ExportId = @id");
    const r = result.recordset[0];
    const t = (v: unknown) => String(v ?? "").trim();
    return r ? { id: Number(r.ExportId), name: t(r.Kunde), country: t(r.Land), city: t(r.Stadt), zip: t(r.PLZ), address: t(r.Adresse), email: t(r.Mail) } : null;
  } catch (e) {
    throw translate(e, "dbo.DS_Kunden");
  }
}

const nullable = (v: string) => (v.trim() === "" ? null : v.trim());

async function nameTaken(request: sql.Request, name: string, exceptId: number): Promise<boolean> {
  const r = await request.input("checkName", sql.NVarChar(255), name).input("exceptId", sql.Int, exceptId)
    .query<{ n: number }>("SELECT COUNT(*) AS n FROM dbo.DS_Kunden WHERE LTRIM(RTRIM(Kunde)) = @checkName AND ExportId <> @exceptId");
  return r.recordset[0].n > 0;
}

/** Neuer Kunde (INSERT, die ID vergibt der SQL Server); gleiche Namen sind nicht erlaubt */
export async function createCustomer(values: Pick<CustomerValues, "name" | "country" | "city">): Promise<number> {
  const tx = new sql.Transaction(await pool());
  await tx.begin(sql.ISOLATION_LEVEL.SERIALIZABLE);
  try {
    if (await nameTaken(new sql.Request(tx), values.name, 0)) throw new DbError(`Den Kunden „${values.name}“ gibt es schon.`, 409);
    const r = await new sql.Request(tx)
      .input("name", sql.NVarChar(255), values.name.trim())
      .input("country", sql.NVarChar(255), nullable(values.country))
      .input("city", sql.NVarChar(100), nullable(values.city))
      .query<{ ExportId: number }>("INSERT INTO dbo.DS_Kunden (Kunde, Land, Stadt) OUTPUT INSERTED.ExportId VALUES (@name, @country, @city)");
    await tx.commit();
    return r.recordset[0].ExportId;
  } catch (e) {
    await tx.rollback().catch(() => undefined);
    throw translate(e, "dbo.DS_Kunden");
  }
}

/**
 * Kunde ändern. Ändert sich der Name, wird er in allen verknüpften Tabellen (CUSTOMER_LINKS) mitgeändert,
 * alles in einer Transaktion: Schlägt ein Teil fehl, bleibt nichts geändert.
 */
export async function updateCustomer(id: number, values: CustomerValues): Promise<{ renamed: { label: string; count: number }[] }> {
  const tx = new sql.Transaction(await pool());
  await tx.begin(sql.ISOLATION_LEVEL.SERIALIZABLE);
  let object = "dbo.DS_Kunden";
  try {
    const current = await new sql.Request(tx).input("id", sql.Int, id).query<{ Kunde: string }>("SELECT Kunde FROM dbo.DS_Kunden WITH (UPDLOCK) WHERE ExportId = @id");
    if (!current.recordset[0]) throw new DbError("Diesen Kunden gibt es nicht.", 404);
    const oldName = current.recordset[0].Kunde.trim();
    const newName = values.name.trim();
    const renaming = oldName !== newName;
    if (renaming && (await nameTaken(new sql.Request(tx), newName, id))) throw new DbError(`Den Kunden „${newName}“ gibt es schon.`, 409);
    await new sql.Request(tx)
      .input("id", sql.Int, id)
      .input("name", sql.NVarChar(255), newName)
      .input("country", sql.NVarChar(255), nullable(values.country))
      .input("city", sql.NVarChar(100), nullable(values.city))
      .input("zip", sql.NVarChar(255), nullable(values.zip))
      .input("address", sql.NVarChar(255), nullable(values.address))
      .input("email", sql.NVarChar(255), nullable(values.email))
      .query("UPDATE dbo.DS_Kunden SET Kunde = @name, Land = @country, Stadt = @city, PLZ = @zip, Adresse = @address, [E-Mail] = @email WHERE ExportId = @id");
    const renamed: { label: string; count: number }[] = [];
    if (renaming) {
      for (const link of CUSTOMER_LINKS) {
        object = `dbo.${link.table}.${link.column}`;
        const r = await new sql.Request(tx)
          .input("old", sql.NVarChar(255), oldName)
          .input("new", sql.NVarChar(255), newName)
          .query(`UPDATE dbo.${quote(link.table)} SET ${quote(link.column)} = @new WHERE LTRIM(RTRIM(${quote(link.column)})) = @old`);
        if (r.rowsAffected[0]) renamed.push({ label: link.label, count: r.rowsAffected[0] });
      }
    }
    await tx.commit();
    return { renamed };
  } catch (e) {
    await tx.rollback().catch(() => undefined);
    throw translate(e, object);
  }
}

/** Was in den verknüpften Tabellen noch auf den Kunden verweist (Name oder FirmenID bei Anhängen) */
async function customerReferences(request: () => sql.Request, customer: { id: number; name: string }): Promise<{ label: string; count: number }[]> {
  const refs: { label: string; count: number }[] = [];
  for (const link of CUSTOMER_LINKS) {
    const extra = link.table === "Anhang" ? " OR FirmenID = @id" : "";
    const r = await request()
      .input("name", sql.NVarChar(255), customer.name)
      .input("id", sql.Int, customer.id)
      .query<{ n: number }>(`SELECT COUNT(*) AS n FROM dbo.${quote(link.table)} WHERE LTRIM(RTRIM(${quote(link.column)})) = @name${extra}`);
    if (r.recordset[0].n) refs.push({ label: link.label, count: r.recordset[0].n });
  }
  return refs;
}

/** Kunde löschen, nur wenn nichts mehr auf ihn verweist */
export async function deleteCustomer(id: number): Promise<void> {
  const tx = new sql.Transaction(await pool());
  await tx.begin(sql.ISOLATION_LEVEL.SERIALIZABLE);
  try {
    const current = await new sql.Request(tx).input("id", sql.Int, id).query<{ Kunde: string }>("SELECT Kunde FROM dbo.DS_Kunden WITH (UPDLOCK) WHERE ExportId = @id");
    if (!current.recordset[0]) throw new DbError("Diesen Kunden gibt es nicht.", 404);
    const refs = await customerReferences(() => new sql.Request(tx), { id, name: current.recordset[0].Kunde.trim() });
    if (refs.length) throw new DbError(`Löschen nicht möglich, dem Kunden ist noch etwas zugeordnet: ${refs.map((r) => `${r.label} (${r.count})`).join(", ")}.`, 409);
    await new sql.Request(tx).input("id", sql.Int, id).query("DELETE FROM dbo.DS_Kunden WHERE ExportId = @id");
    await tx.commit();
  } catch (e) {
    await tx.rollback().catch(() => undefined);
    throw translate(e, "dbo.DS_Kunden bzw. verknüpfte Tabellen");
  }
}

/** Alle Einträge eines Bereichs für eine Firma (Firma ist in den Tabellen Freitext, verglichen ohne Leerzeichen am Rand) */
export async function listAreaForCompany(area: Area, company: string): Promise<AreaRow[]> {
  try {
    const result = await (await pool())
      .request()
      .input("company", sql.NVarChar(255), company)
      .query(`SELECT ${areaSelect(area)} FROM dbo.${quote(area.table)} WHERE LTRIM(RTRIM(${quote(companyColumn(area))})) = @company AND ${areaNotEmpty(area)} ORDER BY ID`);
    return result.recordset.map((r) => toAreaRow(area, r));
  } catch (e) {
    throw translate(e, `dbo.${area.table}`);
  }
}

/** Anhänge eines Kunden (ohne Inhalt); zugeordnet über FirmenID oder den Firmennamen */
export async function listDocuments(customer: CustomerRecord): Promise<CustomerDocument[]> {
  try {
    const result = await (await pool())
      .request()
      .input("id", sql.Int, customer.id)
      .input("company", sql.NVarChar(255), customer.name)
      .query<{ ID: number; Filename: string | null; Typ: string | null }>(
        "SELECT ID, Filename, Typ FROM dbo.Anhang WHERE FirmenID = @id OR LTRIM(RTRIM(Firma)) = @company ORDER BY ID",
      );
    return result.recordset.map((r) => ({ id: r.ID, name: (r.Filename ?? "").trim() || `Anhang ${r.ID}`, type: (r.Typ ?? "").trim() }));
  } catch (e) {
    throw translate(e, "dbo.Anhang");
  }
}

/** Inhalt eines Anhangs, nur wenn er zum Kunden gehört */
export async function getDocument(customer: CustomerRecord, documentId: number): Promise<{ name: string; data: Buffer } | null> {
  try {
    const result = await (await pool())
      .request()
      .input("doc", sql.Int, documentId)
      .input("id", sql.Int, customer.id)
      .input("company", sql.NVarChar(255), customer.name)
      .query<{ Filename: string | null; Data: Buffer | null }>(
        "SELECT Filename, Data FROM dbo.Anhang WHERE ID = @doc AND (FirmenID = @id OR LTRIM(RTRIM(Firma)) = @company)",
      );
    const r = result.recordset[0];
    return r?.Data ? { name: (r.Filename ?? "").trim() || `anhang-${documentId}`, data: r.Data } : null;
  } catch (e) {
    throw translate(e, "dbo.Anhang");
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
