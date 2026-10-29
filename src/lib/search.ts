/**
 * Globale Suche (Kopfzeile, Strg+K): ein Begriff über alle Bereiche, die man lesen darf, und die Kunden.
 * Dieselbe Logik im Dienst und auf der Testseite. Passwörter stehen nie in den Zeilen und werden nie durchsucht.
 */
import type { Area, AreaRow } from "./areas";
import type { Customer } from "./types";

export const SEARCH_MIN = 2;
export const SEARCH_MAX = 100;
/** Treffer je Bereich in der Liste; die Gesamtzahl steht daneben */
export const SEARCH_PER_GROUP = 6;

export interface SearchHit {
  id: number;
  /** z. B. „HPE ProLiant DL360 Gen10“ */
  title: string;
  /** Firma (bei Kunden: Stadt) */
  subtitle: string;
  /** Feld, in dem der Begriff steht, und sein Wert (leer, wenn er im Titel steht) */
  field: string;
  value: string;
}

export interface SearchGroup {
  /** Bereich (z. B. „server“) oder „kunden“ */
  id: string;
  label: string;
  total: number;
  hits: SearchHit[];
}

export interface SearchResponse {
  query: string;
  groups: SearchGroup[];
}

/** Kurzer Name eines Systems aus dem passenden Feld des Bereichs */
export function itemTitle(row: AreaRow): string {
  for (const key of ["model", "licenseType", "product", "hostname", "function", "manufacturer"]) {
    const v = String(row[key] ?? "").trim();
    if (v) return v;
  }
  return "";
}

const norm = (s: string) => s.toLocaleLowerCase("de").trim();

/** 0 = genau, 1 = beginnt damit, 2 = enthält, -1 = kein Treffer */
function rank(value: string, q: string): number {
  const v = norm(value);
  if (!v) return -1;
  if (v === q) return 0;
  if (v.startsWith(q)) return 1;
  return v.includes(q) ? 2 : -1;
}

/** Bester Treffer einer Zeile über ID und alle Felder des Bereichs */
function matchRow(area: Area, row: AreaRow, q: string): { rank: number; field: string; value: string } | null {
  let best: { rank: number; field: string; value: string } | null = String(row.id) === q ? { rank: 0, field: "ID", value: String(row.id) } : null;
  for (const f of area.fields) {
    const value = String(row[f.key] ?? "");
    const r = rank(value, q);
    if (r >= 0 && (!best || r < best.rank)) best = { rank: r, field: f.label, value };
  }
  return best;
}

/** Treffer gruppiert: Kunden, dann die Bereiche in der übergebenen Reihenfolge; je Gruppe genaue Treffer zuerst */
export function search(q: string, areas: { area: Area; rows: AreaRow[] }[], customers: Customer[] | null): SearchGroup[] {
  const query = norm(q);
  if (query.length < SEARCH_MIN) return [];
  const groups: SearchGroup[] = [];
  if (customers) {
    // Name vor Stadt
    const score = (c: Customer) => {
      const name = rank(c.name, query);
      const city = rank(c.city, query);
      return name >= 0 ? name : city >= 0 ? 3 + city : -1;
    };
    const found = customers
      .map((c) => ({ c, r: score(c) }))
      .filter((x) => x.r >= 0)
      .sort((a, b) => a.r - b.r || a.c.name.localeCompare(b.c.name, "de"));
    if (found.length)
      groups.push({ id: "kunden", label: "Kunden", total: found.length, hits: found.slice(0, SEARCH_PER_GROUP).map(({ c }) => ({ id: c.id, title: c.name, subtitle: c.city, field: "", value: "" })) });
  }
  for (const { area, rows } of areas) {
    const found = rows
      .map((row) => ({ row, m: matchRow(area, row, query) }))
      .filter((x): x is { row: AreaRow; m: NonNullable<ReturnType<typeof matchRow>> } => x.m !== null)
      .sort((a, b) => a.m.rank - b.m.rank || a.row.id - b.row.id);
    if (!found.length) continue;
    groups.push({
      id: area.id,
      label: area.plural ?? area.title.replace(/^Übersicht /, ""),
      total: found.length,
      hits: found.slice(0, SEARCH_PER_GROUP).map(({ row, m }) => {
        const title = itemTitle(row) || `${area.singular} ${row.id}`;
        return { id: row.id, title, subtitle: String(row.company ?? ""), field: m.value === title ? "" : m.field, value: m.value === title ? "" : m.value };
      }),
    });
  }
  return groups;
}
