/**
 * Änderungsverlauf (cmdb.ChangeLog): Anlegen, Bearbeiten, Status, Löschen, Dokumente je Eintrag. Ein Fehler beim
 * Aufzeichnen bricht die eigentliche Änderung nie ab, er landet nur im Protokoll des Dienstes.
 */
import sql from "mssql";
import type { HistoryAction, HistoryChange, HistoryEntry } from "@/lib/history";
import { pool } from "./db";
import { ENV } from "./env";
import { log } from "./log";

// Testmodus: im Speicher
const memory: (HistoryEntry & { area: string; itemId: number })[] = [];
let memoryId = 0;

export async function recordChange(username: string, area: string, itemId: number, action: HistoryAction, changes: HistoryChange[] = []): Promise<void> {
  // Passwörter o. Ä. nie mit Wert speichern
  const safe = changes.map((c) => (c.secret ? { label: c.label, secret: true } : c));
  if (ENV.testMode) {
    memory.push({ id: ++memoryId, at: new Date().toISOString(), username, action, changes: safe, area, itemId });
    return;
  }
  try {
    await (await pool())
      .request()
      .input("u", sql.NVarChar(64), username)
      .input("a", sql.NVarChar(50), area)
      .input("i", sql.Int, itemId)
      .input("x", sql.NVarChar(20), action)
      .input("c", sql.NVarChar(sql.MAX), JSON.stringify(safe))
      .query("INSERT INTO cmdb.ChangeLog (Username, Area, ItemId, Action, Changes) VALUES (@u, @a, @i, @x, @c)");
  } catch (e) {
    log(`Änderungsverlauf nicht geschrieben (${area} ${itemId}): ${e instanceof Error ? e.message : String(e)}`);
  }
}

export async function listChanges(area: string, itemId: number): Promise<HistoryEntry[]> {
  if (ENV.testMode)
    return memory
      .filter((m) => m.area === area && m.itemId === itemId)
      .map(({ id, at, username, action, changes }) => ({ id, at, username, action, changes }))
      .reverse();
  const r = await (await pool())
    .request()
    .input("a", sql.NVarChar(50), area)
    .input("i", sql.Int, itemId)
    .query<{ Id: number; At: Date; Username: string; Action: HistoryAction; Changes: string | null }>(
      "SELECT TOP 200 Id, At, Username, Action, Changes FROM cmdb.ChangeLog WHERE Area = @a AND ItemId = @i ORDER BY At DESC, Id DESC",
    );
  return r.recordset.map((x) => ({ id: Number(x.Id), at: x.At.toISOString(), username: x.Username, action: x.Action, changes: x.Changes ? (JSON.parse(x.Changes) as HistoryChange[]) : [] }));
}
