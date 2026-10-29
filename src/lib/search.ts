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
  /** Begriff für „alle anzeigen“ (Tabellensuche des Bereichs); leer = ganzer Bereich */
  filter: string;
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

/** Suchbegriff in Wörter zerlegen: jedes Wort muss passen („simons oracle“) */
export const searchTerms = (q: string) => norm(q).split(/\s+/).filter(Boolean);

/** 0 = genau, 1 = beginnt damit, 2 = enthält, -1 = kein Treffer */
function rank(value: string, term: string): number {
  const v = norm(value);
  if (!v) return -1;
  if (v === term) return 0;
  if (v.startsWith(term)) return 1;
  return v.includes(term) ? 2 : -1;
}

/** Wörter, über die ein ganzer Bereich passt, z. B. „oracle“, „server“, „windows“ */
const areaText = (area: Area) => norm([area.id, area.title, area.singular, area.plural ?? "", area.typeValue].join(" "));

type RowMatch = { rank: number; field: string; value: string };

/**
 * Jedes Wort muss in der ID, einem Feld oder im Namen des Bereichs stehen. Rang = Summe je Wort (kleiner ist besser);
 * angezeigt wird das Feld mit dem besten Treffer.
 */
function matchRow(area: Area, row: AreaRow, terms: string[], areaWords: string): RowMatch | null {
  let total = 0;
  let shown: RowMatch | null = null;
  for (const term of terms) {
    let best: RowMatch | null = String(row.id) === term ? { rank: 0, field: "ID", value: String(row.id) } : null;
    for (const f of area.fields) {
      const value = String(row[f.key] ?? "");
      const r = rank(value, term);
      if (r >= 0 && (!best || r < best.rank)) best = { rank: r, field: f.label, value };
    }
    if (best) {
      total += best.rank;
      if (!shown || best.rank < shown.rank) shown = best;
    } else if (areaWords.includes(term)) total += 1;
    else return null;
  }
  return { rank: total, field: shown?.field ?? "", value: shown?.value ?? "" };
}

/** Treffer gruppiert: Kunden, dann die Bereiche in der übergebenen Reihenfolge; je Gruppe genaue Treffer zuerst */
export function search(q: string, areas: { area: Area; rows: AreaRow[] }[], customers: Customer[] | null): SearchGroup[] {
  const terms = searchTerms(q);
  if (norm(q).length < SEARCH_MIN || !terms.length) return [];
  const groups: SearchGroup[] = [];
  if (customers) {
    // Jedes Wort im Namen oder in der Stadt; Name zählt mehr
    const score = (c: Customer) => {
      let total = 0;
      for (const term of terms) {
        const name = rank(c.name, term);
        const city = rank(c.city, term);
        if (name < 0 && city < 0) return -1;
        total += name >= 0 ? name : 3 + city;
      }
      return total;
    };
    const found = customers
      .map((c) => ({ c, r: score(c) }))
      .filter((x) => x.r >= 0)
      .sort((a, b) => a.r - b.r || a.c.name.localeCompare(b.c.name, "de"));
    if (found.length)
      groups.push({ id: "kunden", label: "Kunden", total: found.length, filter: "", hits: found.slice(0, SEARCH_PER_GROUP).map(({ c }) => ({ id: c.id, title: c.name, subtitle: c.city, field: "", value: "" })) });
  }
  for (const { area, rows } of areas) {
    const words = areaText(area);
    const found = rows
      .map((row) => ({ row, m: matchRow(area, row, terms, words) }))
      .filter((x): x is { row: AreaRow; m: RowMatch } => x.m !== null)
      .sort((a, b) => a.m.rank - b.m.rank || a.row.id - b.row.id);
    if (!found.length) continue;
    // Für „alle anzeigen“: das längste Wort, das nicht nur den Bereich meint (die Tabellensuche kennt nur einen Begriff)
    const filter = q.trim().split(/\s+/).filter((w) => w && !words.includes(norm(w))).sort((a, b) => b.length - a.length)[0] ?? "";
    groups.push({
      id: area.id,
      label: area.plural ?? area.title.replace(/^Übersicht /, ""),
      total: found.length,
      filter,
      hits: found.slice(0, SEARCH_PER_GROUP).map(({ row, m }) => {
        const title = itemTitle(row) || `${area.singular} ${row.id}`;
        const subtitle = String(row.company ?? "");
        // Feld nur nennen, wenn der Treffer nicht ohnehin im Titel oder in der Firma steht
        const repeated = !m.field || m.value === title || m.value === subtitle;
        return { id: row.id, title, subtitle, field: repeated ? "" : m.field, value: repeated ? "" : m.value };
      }),
    });
  }
  return groups;
}
