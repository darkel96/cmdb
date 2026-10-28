/**
 * Versionierte Migrationen für das eigene Schema cmdb (server/migrations/NNN_*.sql). Der Dienst spielt beim Start
 * fehlende Skripte der Reihe nach ein und merkt sie sich in cmdb.SchemaVersion. dbo wird nie verändert.
 */
import sql from "mssql";
import m001 from "../migrations/001_anmeldungen_und_rollen.sql?raw";
import { log } from "./log";

const MIGRATIONS: { version: number; name: string; script: string }[] = [{ version: 1, name: "001_anmeldungen_und_rollen", script: m001 }];

export async function migrate(pool: sql.ConnectionPool): Promise<void> {
  const schema = await pool.request().query<{ ok: number }>("SELECT CASE WHEN SCHEMA_ID('cmdb') IS NULL THEN 0 ELSE 1 END AS ok");
  if (!schema.recordset[0].ok) throw new Error("Schema cmdb fehlt (CREATE SCHEMA cmdb AUTHORIZATION svc_cmdb).");
  await pool.request().query(`IF OBJECT_ID('cmdb.SchemaVersion') IS NULL
    CREATE TABLE cmdb.SchemaVersion (Version int NOT NULL CONSTRAINT PK_SchemaVersion PRIMARY KEY, Name nvarchar(200) NOT NULL,
      AppliedAt datetime2(0) NOT NULL CONSTRAINT DF_SchemaVersion_AppliedAt DEFAULT SYSUTCDATETIME())`);
  const done = new Set((await pool.request().query<{ Version: number }>("SELECT Version FROM cmdb.SchemaVersion")).recordset.map((r) => r.Version));
  for (const m of MIGRATIONS) {
    if (done.has(m.version)) continue;
    const tx = new sql.Transaction(pool);
    await tx.begin();
    try {
      await new sql.Request(tx).batch(m.script);
      await new sql.Request(tx).input("v", sql.Int, m.version).input("n", sql.NVarChar(200), m.name).query("INSERT INTO cmdb.SchemaVersion (Version, Name) VALUES (@v, @n)");
      await tx.commit();
      log(`Migration ${m.name} eingespielt`);
    } catch (e) {
      await tx.rollback().catch(() => undefined);
      throw new Error(`Migration ${m.name} fehlgeschlagen: ${e instanceof Error ? e.message : String(e)}`);
    }
  }
}
