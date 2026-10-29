import type { AreaRow } from "./areas";

/** Support-Ende eines Betriebssystems (Name wie in Stammdaten › Server-OS); Datum als JJJJ-MM-TT */
export interface OsSupportEntry {
  name: string;
  mainstreamEnd: string;
  extendedEnd: string;
  changedBy?: string;
}

/** Wie server/migrations/003_os_support.sql: Vorbelegung aus dem Microsoft-Lebenszyklus (für Testmodus und Testseite) */
export const OS_SUPPORT_SEED: OsSupportEntry[] = [
  { name: "Windows XP", mainstreamEnd: "2009-04-14", extendedEnd: "2014-04-08" },
  { name: "Windows 7 Enterprise", mainstreamEnd: "2015-01-13", extendedEnd: "2020-01-14" },
  { name: "Windows 10 Enterprise", mainstreamEnd: "2025-10-14", extendedEnd: "2025-10-14" },
  { name: "Windows Server 2008", mainstreamEnd: "2015-01-13", extendedEnd: "2020-01-14" },
  { name: "Windows Server 2012", mainstreamEnd: "2018-10-09", extendedEnd: "2023-10-10" },
  { name: "Windows Server 2016", mainstreamEnd: "2022-01-11", extendedEnd: "2027-01-12" },
  { name: "Windows Server 2019", mainstreamEnd: "2024-01-09", extendedEnd: "2029-01-09" },
  { name: "Windows Server 2022", mainstreamEnd: "2026-10-13", extendedEnd: "2031-10-14" },
  { name: "Windows Server 2025", mainstreamEnd: "2029-11-13", extendedEnd: "2034-11-14" },
].map((e) => ({ ...e, changedBy: "Vorbelegung" }));

/**
 * Windows-Systeme: Ohne eigenes „Support bis“ gilt das LTS-Ende des Betriebssystems; ist es vorbei, gilt EOL = Ja.
 * Nur Anzeige (dbo bleibt unverändert); supportSource/eolSource = „Server-OS“ kennzeichnen abgeleitete Werte.
 */
export function withOsSupport(rows: AreaRow[], entries: OsSupportEntry[], today = new Date().toISOString().slice(0, 10)): AreaRow[] {
  const byName = new Map(entries.map((e) => [e.name.trim().toLowerCase(), e]));
  return rows.map((row) => {
    const os = byName.get(String(row.os ?? "").trim().toLowerCase());
    if (!os?.extendedEnd) return row;
    const next: AreaRow = { ...row };
    if (!String(row.supportUntil ?? "").trim()) {
      next.supportUntil = os.extendedEnd;
      next.supportSource = "Server-OS";
    }
    if (String(row.eol ?? "").toLowerCase() !== "ja" && os.extendedEnd < today) {
      next.eol = "Ja";
      next.eolSource = "Server-OS";
    }
    return next;
  });
}
