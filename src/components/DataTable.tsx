import { useEffect, useLayoutEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { ArrowDown, ArrowUp, ChevronLeft, ChevronRight, FileSpreadsheet, FolderOpen, MoveHorizontal, RotateCcw, Search } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { readView, writeView } from "@/lib/sessionView";
import { cn } from "@/lib/utils";
import { ColumnPicker, EMPTY_VALUE } from "./ColumnPicker";

export interface Column<T> {
  key: string;
  label: string;
  value: (row: T) => string;
  /** Wert zum Sortieren, falls er sich von der Anzeige unterscheidet (z. B. Datum als JJJJ-MM-TT) */
  sortValue?: (row: T) => string;
  /** Feste Breite in Pixeln; Spalten ohne Breite teilen sich den Rest */
  width?: number;
  className?: string;
  /** Eigene Darstellung der Zelle (z. B. Auswahl direkt in der Zeile); Suche, Filter und Export nutzen weiter value */
  render?: (row: T) => ReactNode;
}

const PAGE_SIZES = [10, 20, 30, 100];
const COMPACT_PAGE_SIZES = [5, 10, 20];

function includes(haystack: string, needle: string): boolean {
  // In Anführungszeichen: genau dieser Wert ("" = leer), z. B. aus einer Auflistung
  const exact = /^"(.*)"$/.exec(needle.trim());
  if (exact) return haystack.trim().toLocaleLowerCase("de") === exact[1].trim().toLocaleLowerCase("de");
  return haystack.toLocaleLowerCase("de").includes(needle.trim().toLocaleLowerCase("de"));
}

const clampWidth = (w: number) => Math.round(Math.min(800, Math.max(48, w)));
/** Obergrenze beim automatischen Anpassen, damit eine lange Spalte nicht alles verdrängt */
const AUTO_MAX = 320;
/** Bis zu dieser Breite werden lange Spalten gestaucht, wenn die Tabelle sonst nicht ins Fenster passt (Rest mit „…“) */
const SHRINK_MIN = 110;

/**
 * Breiten so stauchen, dass ihre Summe in `target` passt: die breitesten Spalten zuerst auf eine gemeinsame Obergrenze,
 * keine unter ihr Minimum. Passt es auch dann nicht, bleibt es beim Minimum (die Tabelle scrollt in sich).
 */
export function shrinkToFit(items: { key: string; width: number; min: number }[], target: number): Record<string, number> {
  const total = (cap: number) => items.reduce((sum, i) => sum + Math.max(i.min, Math.min(i.width, cap)), 0);
  let cap = Math.max(0, ...items.map((i) => i.width));
  if (target > 0 && total(cap) > target) {
    let low = 0;
    let high = cap;
    while (high - low > 1) {
      const mid = Math.floor((low + high) / 2);
      if (total(mid) > target) high = mid;
      else low = mid;
    }
    cap = low;
  }
  return Object.fromEntries(items.map((i) => [i.key, Math.max(i.min, Math.min(i.width, cap))]));
}

interface TableView {
  search: string;
  filters: Record<string, string>;
  picks: Record<string, string[]>;
  sort: { key: string; desc: boolean };
  pageSize: number;
  page: number;
  selected: string | number | null;
}

function readWidths(key: string): Record<string, number> {
  try {
    const parsed = JSON.parse(localStorage.getItem(key) ?? "{}") as unknown;
    if (!parsed || typeof parsed !== "object") return {};
    return Object.fromEntries(Object.entries(parsed).filter(([, v]) => typeof v === "number" && v > 0)) as Record<string, number>;
  } catch {
    return {};
  }
}

/** Schrift eines Elements für die Messung; computed font ist leer, sobald z. B. tabular-nums gesetzt ist */
function fontOf(el: Element): string {
  const s = getComputedStyle(el);
  return `${s.fontStyle} ${s.fontWeight} ${s.fontSize} ${s.fontFamily}`;
}

let measureContext: CanvasRenderingContext2D | null = null;
/** Textbreite in Pixeln in der Schrift der Tabelle */
function measure(text: string, font: string): number {
  measureContext ??= document.createElement("canvas").getContext("2d");
  if (!measureContext) return text.length * 8;
  measureContext.font = font;
  return measureContext.measureText(text).width;
}

function csvCell(value: string): string {
  return /[";\n]/.test(value) ? `"${value.replace(/"/g, '""')}"` : value;
}

/** Tabelle wie in der bisherigen Anwendung: Suche, Filter je Spalte, Sortierung, Seitengrösse, Blättern und Export */
export function DataTable<T>({ title, columns, rows, rowKey, exportName, emptyText = "Keine Einträge.", onOpen, actions, compact = false, defaultSort, initialFilters, initialSearch, highlight, selectedActions, storageKey, viewKey }: {
  title: string;
  columns: Column<T>[];
  rows: T[];
  rowKey: (row: T) => string | number;
  exportName: string;
  emptyText?: string;
  /** Öffnet die markierte Zeile (Knopf „Öffnen“ oder Doppelklick) */
  onOpen?: (row: T) => void;
  /** Weitere Knöpfe links in der Werkzeugleiste, z. B. „Anlegen“ */
  actions?: ReactNode;
  /** Kompakt für mehrere Tabellen untereinander (z. B. Kundenansicht): nicht über die ganze Höhe, 5/10/20 je Seite */
  compact?: boolean;
  /** Anfangs-Sortierung, sonst erste Spalte aufsteigend */
  defaultSort?: { key: string; desc: boolean };
  /** Anfangs-Suche (z. B. „alle anzeigen“ aus der globalen Suche) */
  initialSearch?: string;
  /** Anfangs-Filter je Spalte (z. B. aus einer Auflistung) */
  initialFilters?: Record<string, string>;
  /** Zeile rot hervorheben, z. B. EOL = Ja bei den auslaufenden Systemen */
  highlight?: (row: T) => boolean;
  /** Bedienelemente für die markierte Zeile in der Werkzeugleiste, z. B. Status setzen */
  selectedActions?: (row: T) => ReactNode;
  /** Unter welchem Namen die Spaltenbreiten im Browser gemerkt werden; Standard ist der Titel */
  storageKey?: string;
  /** Suche, Filter, Sortierung, Seite und markierte Zeile für die Sitzung merken (zurück aus einem Datensatz) */
  viewKey?: string;
}) {
  // Gemerkte Ansicht nur beim ersten Anzeigen lesen
  const [view] = useState(() => readView<TableView>(viewKey));
  const [search, setSearch] = useState(view.search ?? initialSearch ?? "");
  const [filters, setFilters] = useState<Record<string, string>>(view.filters ?? initialFilters ?? {});
  const [sort, setSort] = useState<{ key: string; desc: boolean }>(view.sort ?? defaultSort ?? { key: columns[0].key, desc: false });
  const sizes = compact ? COMPACT_PAGE_SIZES : PAGE_SIZES;
  const [pageSize, setPageSize] = useState(view.pageSize && sizes.includes(view.pageSize) ? view.pageSize : compact ? 10 : 30);
  const [page, setPage] = useState(view.page ?? 0);
  // Ausgewählte Zeile (Klick), blau hervorgehoben wie in GAPTEQ
  const [selected, setSelected] = useState<string | number | null>(view.selected ?? null);
  // Spaltenbreiten, die die Person gezogen oder per Doppelklick angepasst hat; je Tabelle im Browser gemerkt
  const widthsKey = `cmdb-spalten:${storageKey ?? title}`;
  const [widths, setWidths] = useState<Record<string, number>>(() => readWidths(widthsKey));
  // Automatisch an den Inhalt angepasste Breiten (beim ersten Anzeigen, nicht gespeichert); gezogene haben Vorrang
  const tableRef = useRef<HTMLTableElement>(null);
  const [autoWidths, setAutoWidths] = useState<Record<string, number>>({});
  // Verfügbare Breite; automatische Breiten werden darauf gestaucht, damit nicht nach rechts gescrollt werden muss
  const scrollRef = useRef<HTMLDivElement>(null);
  const [available, setAvailable] = useState(0);
  useLayoutEffect(() => {
    const el = scrollRef.current;
    if (!el) return;
    const update = () => setAvailable(el.clientWidth);
    update();
    const observer = new ResizeObserver(update);
    observer.observe(el);
    return () => observer.disconnect();
  }, []);
  const fitted = useMemo(() => {
    const free = columns.filter((c) => widths[c.key] === undefined && autoWidths[c.key] !== undefined);
    const fixed = columns.reduce((sum, c) => sum + (widths[c.key] ?? (autoWidths[c.key] === undefined ? (c.width ?? 140) : 0)), 0);
    // Spalten mit eigener Darstellung (z. B. Status-Auswahl) behalten ihre Breite
    const items = free.map((c) => ({ key: c.key, width: autoWidths[c.key], min: c.render ? autoWidths[c.key] : Math.min(autoWidths[c.key], SHRINK_MIN) }));
    // 1 px Luft gegen Rundung, sonst erscheint eine Scrollleiste für einen Pixel
    return shrinkToFit(items, available - fixed - 1);
  }, [columns, widths, autoWidths, available]);
  const widthOf = (c: Column<T>) => widths[c.key] ?? fitted[c.key] ?? c.width;
  const saveWidths = (next: Record<string, number>) => {
    setWidths(next);
    try {
      if (Object.keys(next).length) localStorage.setItem(widthsKey, JSON.stringify(next));
      else localStorage.removeItem(widthsKey);
    } catch {
      /* ohne Speicher gelten die Breiten nur bis zum Neuladen */
    }
  };

  // Wertefilter je Spalte (Mehrfachauswahl); „(leer)“ steht für leere Zellen
  const [picks, setPicks] = useState<Record<string, string[]>>(view.picks ?? {});
  useEffect(() => writeView(viewKey, { search, filters, picks, sort, pageSize, page, selected } satisfies TableView), [viewKey, search, filters, picks, sort, pageSize, page, selected]);
  const cellValue = (c: Column<T>, row: T) => c.value(row).trim() || EMPTY_VALUE;
  /** Passt die Zeile zu Suche und allen Spaltenfiltern, auf Wunsch ohne eine Spalte (für deren Werteliste)? */
  const matches = (row: T, except?: string) =>
    (!search.trim() || columns.some((c) => includes(c.value(row), search))) &&
    columns.every(
      (c) =>
        c.key === except ||
        ((!filters[c.key]?.trim() || includes(c.value(row), filters[c.key])) && (!picks[c.key]?.length || picks[c.key].includes(cellValue(c, row)))),
    );

  // Werteliste nur bei Spalten mit wenigen, sich wiederholenden Werten (2 bis 30); bei IDs, Lizenzen usw. nur Freitext
  const pickable = useMemo(() => {
    const result = new Set<string>();
    for (const c of columns) {
      const seen = new Set<string>();
      for (const row of rows) {
        seen.add(cellValue(c, row));
        if (seen.size > 30) break;
      }
      // Nur wenn sich Werte wiederholen (im Schnitt mindestens zweimal), sonst ist es eine Liste aller Einträge
      if (seen.size >= 2 && seen.size <= 30 && seen.size * 2 <= rows.length) result.add(c.key);
    }
    return result;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [rows, columns]);

  /** Werte einer Spalte mit Anzahl, unter den übrigen Filtern; gewählte bleiben sichtbar, auch mit 0 */
  const valuesOf = (c: Column<T>) => {
    const counts = new Map<string, number>();
    for (const row of rows) if (matches(row, c.key)) counts.set(cellValue(c, row), (counts.get(cellValue(c, row)) ?? 0) + 1);
    for (const v of picks[c.key] ?? []) if (!counts.has(v)) counts.set(v, 0);
    return [...counts].map(([value, count]) => ({ value, count })).sort((a, b) => (a.value === EMPTY_VALUE ? 1 : b.value === EMPTY_VALUE ? -1 : a.value.localeCompare(b.value, "de", { numeric: true })));
  };

  const filtered = useMemo(() => {
    const result = rows.filter((row) => matches(row));
    const column = columns.find((c) => c.key === sort.key) ?? columns[0];
    const key = column.sortValue ?? column.value;
    result.sort((a, b) => key(a).localeCompare(key(b), "de", { sensitivity: "base", numeric: true }) * (sort.desc ? -1 : 1));
    return result;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [rows, columns, search, filters, picks, sort]);

  const pages = Math.max(1, Math.ceil(filtered.length / pageSize));
  const current = Math.min(page, pages - 1);
  const visible = filtered.slice(current * pageSize, (current + 1) * pageSize);
  const selectedRow = selected === null ? undefined : rows.find((r) => rowKey(r) === selected);
  // Bei festen Spaltenbreiten scrollt die Tabelle seitlich, statt die Spalten zu quetschen
  const minWidth = columns.reduce((sum, c) => sum + (widthOf(c) ?? 140), 0);

  /** Breite ziehen: am rechten Rand der Überschrift, mit Maus oder Finger */
  function startResize(e: React.PointerEvent<HTMLSpanElement>, c: Column<T>) {
    e.preventDefault();
    e.stopPropagation();
    const th = e.currentTarget.closest("th")!;
    const startX = e.clientX;
    const startWidth = th.getBoundingClientRect().width;
    let next = widths;
    const handle = e.currentTarget;
    handle.setPointerCapture(e.pointerId);
    document.body.style.userSelect = "none";
    const move = (ev: PointerEvent) => {
      next = { ...widths, [c.key]: clampWidth(startWidth + ev.clientX - startX) };
      setWidths(next);
    };
    const up = () => {
      handle.removeEventListener("pointermove", move);
      handle.removeEventListener("pointerup", up);
      handle.removeEventListener("pointercancel", up);
      document.body.style.userSelect = "";
      saveWidths(next);
    };
    handle.addEventListener("pointermove", move);
    handle.addEventListener("pointerup", up);
    handle.addEventListener("pointercancel", up);
  }

  /** Doppelklick: so breit wie der längste Inhalt (alle gefilterten Zeilen, nicht nur die sichtbare Seite) */
  /** Breite für den Inhalt einer Spalte: längster Wert aller gefilterten Zeilen bzw. die Überschrift, mit Polster */
  function fitWidth(table: HTMLTableElement, index: number, max = 800): number {
    const c = columns[index];
    const th = table.querySelector(`thead tr th:nth-child(${index + 1})`);
    const td = table.querySelector(`tbody tr td:nth-child(${index + 1})`);
    const header = th ? measure(c.label, fontOf(th)) + 28 + 18 : 0;
    const cellFont = fontOf(td ?? th ?? table);
    let content = 0;
    for (const row of filtered.slice(0, 2000)) content = Math.max(content, measure(c.value(row), cellFont));
    // Eigene Darstellung (z. B. Auswahlliste in der Zeile) braucht Platz für Rahmen und Pfeil
    return Math.min(max, clampWidth(Math.max(header, content + 30 + (c.render ? 48 : 0))));
  }

  function autoFit(e: React.MouseEvent<HTMLSpanElement>, c: Column<T>) {
    e.preventDefault();
    e.stopPropagation();
    const table = e.currentTarget.closest("table")!;
    saveWidths({ ...widths, [c.key]: fitWidth(table, columns.indexOf(c)) });
  }

  /** Alle Spalten neu an Inhalt und Fensterbreite anpassen (Knopf): gezogene Breiten verwerfen, neu messen */
  function fitAll() {
    if (!tableRef.current) return;
    setAutoWidths(Object.fromEntries(columns.map((c, i) => [c.key, fitWidth(tableRef.current!, i, AUTO_MAX)])));
    saveWidths({});
  }

  // Beim ersten Anzeigen mit Daten: Spalten ohne gemerkte Breite passen sich dem Inhalt an (nicht gespeichert)
  const hasRows = filtered.length > 0;
  useLayoutEffect(() => {
    if (!hasRows || !tableRef.current || Object.keys(autoWidths).length) return;
    setAutoWidths(Object.fromEntries(columns.map((c, i) => [c.key, fitWidth(tableRef.current!, i, AUTO_MAX)])));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [hasRows]);

  function exportCsv() {
    const lines = [columns.map((c) => csvCell(c.label)).join(";"), ...filtered.map((row) => columns.map((c) => csvCell(c.value(row))).join(";"))];
    // BOM, damit Excel die Umlaute richtig liest
    const blob = new Blob(["﻿" + lines.join("\r\n")], { type: "text/csv;charset=utf-8" });
    const a = document.createElement("a");
    a.href = URL.createObjectURL(blob);
    a.download = `${exportName}.csv`;
    a.click();
    URL.revokeObjectURL(a.href);
  }

  return (
    <section className={cn("animate-appear flex flex-col overflow-hidden rounded-lg border bg-card shadow-xs", compact ? "shrink-0" : "min-h-0 flex-1")} aria-label={title}>
      {/* Immer volle Höhe, auch bei wenigen Zeilen; Titel, Suche, Spaltenköpfe und Blättern bleiben stehen, nur die Zeilen scrollen */}
      <h2 className="shrink-0 bg-brand px-4 py-2.5 text-lg font-medium text-brand-foreground">{title}</h2>
      <div className="flex shrink-0 items-center justify-end gap-2 border-b px-3 py-2">
        {onOpen && (
          <Button size="sm" disabled={!selectedRow} onClick={() => selectedRow && onOpen(selectedRow)} title={selectedRow ? "Markierte Zeile öffnen" : "Zuerst eine Zeile anklicken"}>
            <FolderOpen aria-hidden />
            Öffnen
          </Button>
        )}
        {actions}
        {selectedRow && selectedActions?.(selectedRow)}
        <span className="flex-1" />
        <Button variant="outline" size="sm" onClick={fitAll} title="Alle Spalten an Inhalt und Fensterbreite anpassen" aria-label="Spalten an Inhalt anpassen">
          <MoveHorizontal aria-hidden />
        </Button>
        {Object.keys(widths).length > 0 && (
          <Button variant="outline" size="sm" onClick={() => saveWidths({})} title="Gezogene Spaltenbreiten verwerfen" aria-label="Spaltenbreiten zurücksetzen">
            <RotateCcw aria-hidden />
          </Button>
        )}
        <Button variant="outline" size="sm" onClick={exportCsv} title="Als CSV exportieren (Excel)" aria-label="Als CSV exportieren">
          <FileSpreadsheet aria-hidden />
        </Button>
        <div className="relative w-full max-w-60">
          <Search className="pointer-events-none absolute left-2.5 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" aria-hidden />
          <Input value={search} onChange={(e) => { setSearch(e.target.value); setPage(0); }} placeholder="Suchen …" aria-label="Suchen" className="h-8 pl-8" />
        </div>
      </div>
      {/* Kompakt (mehrere Tabellen auf einer Seite): kein eigenes senkrechtes Scrollen, sonst fängt die Tabelle das
          Mausrad und die Seite scrollt nicht weiter. Blättern über die Seiten. Volle Höhe: nur die Zeilen scrollen. */}
      <div ref={scrollRef} className={cn(compact ? "scroll-thin-x" : "scroll-thin min-h-0 flex-1")} data-testid="table-scroll">
        {/* border-separate: Bei border-collapse bleiben die Linien im festgehaltenen Kopf nicht stehen, dann scheinen Zeilen durch */}
        <table ref={tableRef} className="w-full table-fixed border-separate border-spacing-0 text-sm" style={{ minWidth }}>
          <colgroup>
            {columns.map((c) => (
              <col key={c.key} style={widthOf(c) ? { width: widthOf(c) } : undefined} />
            ))}
          </colgroup>
          <thead className="sticky top-0 z-[1] bg-card">
            <tr className="text-left text-foreground/75">
              {columns.map((c, i) => (
                <th key={c.key} className={cn("group/th relative border-b bg-muted py-2.5 pr-4 pl-3 font-medium", c.className)} title={c.label} aria-label={c.label} aria-sort={sort.key === c.key ? (sort.desc ? "descending" : "ascending") : undefined}>
                  {/* Text wird im Knopf gekürzt („…“), damit er nicht über den Griff in die nächste Spalte läuft */}
                  <button type="button" className="flex max-w-full items-center gap-1 transition-colors duration-150 hover:text-foreground" onClick={() => setSort((s) => ({ key: c.key, desc: s.key === c.key ? !s.desc : false }))}>
                    <span className="min-w-0 truncate">{c.label}</span>
                    {sort.key === c.key && (sort.desc ? <ArrowDown className="size-3.5 shrink-0" aria-hidden /> : <ArrowUp className="size-3.5 shrink-0" aria-hidden />)}
                  </button>
                  {/* Griff zum Ziehen; Doppelklick passt an den Inhalt an; mit Pfeiltasten in 16-px-Schritten */}
                  <span
                    role="separator"
                    aria-orientation="vertical"
                    aria-label={`Breite der Spalte ${c.label}`}
                    title="Ziehen ändert die Breite, Doppelklick passt sie an den Inhalt an"
                    tabIndex={0}
                    onPointerDown={(e) => startResize(e, c)}
                    onDoubleClick={(e) => autoFit(e, c)}
                    onClick={(e) => e.stopPropagation()}
                    onKeyDown={(e) => {
                      if (e.key !== "ArrowLeft" && e.key !== "ArrowRight") return;
                      e.preventDefault();
                      const current = e.currentTarget.closest("th")!.getBoundingClientRect().width;
                      saveWidths({ ...widths, [c.key]: clampWidth(current + (e.key === "ArrowRight" ? 16 : -16)) });
                    }}
                    className={cn(
                      // Mittig auf der Spaltengrenze: die Linie ist genau die Grenze, greifbar 6 px links und rechts davon
                      "absolute top-0 z-[2] flex h-full w-3 cursor-col-resize touch-none justify-center outline-none after:h-full after:w-px after:bg-border after:transition-colors hover:after:w-0.5 hover:after:bg-brand focus-visible:after:w-0.5 focus-visible:after:bg-brand",
                      i === columns.length - 1 ? "right-0 justify-end" : "-right-1.5",
                    )}
                  />
                </th>
              ))}
            </tr>
            <tr>
              {columns.map((c) => (
                <th key={c.key} className="border-b bg-card px-2 py-1 font-normal">
                  <div className="relative">
                    <Search className="pointer-events-none absolute left-2 top-1/2 size-3.5 -translate-y-1/2 text-muted-foreground" aria-hidden />
                    <Input
                      value={filters[c.key] ?? ""}
                      onChange={(e) => { setFilters((f) => ({ ...f, [c.key]: e.target.value })); setPage(0); }}
                      aria-label={`Filter ${c.label}`}
                      className={cn("h-7 border-transparent pl-7 shadow-none focus-visible:border-input", pickable.has(c.key) && "pr-9")}
                    />
                    {pickable.has(c.key) && (
                      <span className="absolute top-1/2 right-1 -translate-y-1/2">
                        <ColumnPicker
                          label={c.label}
                          load={() => valuesOf(c)}
                          picked={picks[c.key] ?? []}
                          onChange={(next) => { setPicks((p) => ({ ...p, [c.key]: next })); setPage(0); }}
                        />
                      </span>
                    )}
                  </div>
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {visible.map((row) => {
              const key = rowKey(row);
              const isSelected = key === selected;
              return (
                <tr
                  key={key}
                  aria-selected={isSelected}
                  data-highlight={highlight?.(row) || undefined}
                  onClick={() => setSelected(isSelected ? null : key)}
                  onDoubleClick={() => {
                    setSelected(key);
                    onOpen?.(row);
                  }}
                  className={cn(
                    "cursor-pointer transition-colors duration-100",
                    isSelected
                      ? "bg-brand text-brand-foreground"
                      : highlight?.(row)
                        ? "bg-destructive/10 text-destructive hover:bg-destructive/20"
                        : "odd:bg-muted hover:bg-accent",
                  )}
                >
                  {columns.map((c) => {
                    const text = c.value(row);
                    return (
                      <td key={c.key} title={text} className={cn("truncate border-r border-b border-border/60 px-3 py-2 last:border-r-0", c.render && "py-1", c.className)}>
                        {c.render ? c.render(row) : text}
                      </td>
                    );
                  })}
                </tr>
              );
            })}
            {visible.length === 0 && (
              <tr>
                <td colSpan={columns.length} className="px-3 py-6 text-center text-muted-foreground">{emptyText}</td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
      <div className="flex shrink-0 flex-wrap items-center justify-between gap-2 border-t px-3 py-2 text-sm">
        <div className="flex items-center gap-1" role="group" aria-label="Einträge je Seite">
          {sizes.map((size) => (
            <Button key={size} variant={size === pageSize ? "outline" : "ghost"} size="sm" className="h-7 px-2" aria-pressed={size === pageSize} onClick={() => { setPageSize(size); setPage(0); }}>
              {size}
            </Button>
          ))}
        </div>
        <div className="flex items-center gap-2 text-muted-foreground">
          <span data-testid="table-status">Seite {current + 1} von {pages} ({filtered.length} Elemente)</span>
          <Button variant="ghost" size="sm" className="h-7 px-1.5" disabled={current === 0} onClick={() => setPage(current - 1)} aria-label="Vorherige Seite">
            <ChevronLeft aria-hidden />
          </Button>
          <Button variant="ghost" size="sm" className="h-7 px-1.5" disabled={current >= pages - 1} onClick={() => setPage(current + 1)} aria-label="Nächste Seite">
            <ChevronRight aria-hidden />
          </Button>
        </div>
      </div>
    </section>
  );
}
