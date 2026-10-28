import { useMemo, useState, type ReactNode } from "react";
import { ArrowDown, ArrowUp, ChevronLeft, ChevronRight, FileSpreadsheet, FolderOpen, Search } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";

export interface Column<T> {
  key: string;
  label: string;
  value: (row: T) => string;
  /** Wert zum Sortieren, falls er sich von der Anzeige unterscheidet (z. B. Datum als JJJJ-MM-TT) */
  sortValue?: (row: T) => string;
  /** Feste Breite in Pixeln; Spalten ohne Breite teilen sich den Rest */
  width?: number;
  className?: string;
}

const PAGE_SIZES = [10, 20, 30, 100];
const COMPACT_PAGE_SIZES = [5, 10, 20];

function includes(haystack: string, needle: string): boolean {
  // In Anführungszeichen: genau dieser Wert ("" = leer), z. B. aus einer Auflistung
  const exact = /^"(.*)"$/.exec(needle.trim());
  if (exact) return haystack.trim().toLocaleLowerCase("de") === exact[1].trim().toLocaleLowerCase("de");
  return haystack.toLocaleLowerCase("de").includes(needle.trim().toLocaleLowerCase("de"));
}

function csvCell(value: string): string {
  return /[";\n]/.test(value) ? `"${value.replace(/"/g, '""')}"` : value;
}

/** Tabelle wie in der bisherigen Anwendung: Suche, Filter je Spalte, Sortierung, Seitengrösse, Blättern und Export */
export function DataTable<T>({ title, columns, rows, rowKey, exportName, emptyText = "Keine Einträge.", onOpen, actions, compact = false, defaultSort, initialFilters }: {
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
  /** Anfangs-Filter je Spalte (z. B. aus einer Auflistung) */
  initialFilters?: Record<string, string>;
}) {
  const [search, setSearch] = useState("");
  const [filters, setFilters] = useState<Record<string, string>>(initialFilters ?? {});
  const [sort, setSort] = useState<{ key: string; desc: boolean }>(defaultSort ?? { key: columns[0].key, desc: false });
  const sizes = compact ? COMPACT_PAGE_SIZES : PAGE_SIZES;
  const [pageSize, setPageSize] = useState(compact ? 10 : 30);
  const [page, setPage] = useState(0);
  // Ausgewählte Zeile (Klick), blau hervorgehoben wie in GAPTEQ
  const [selected, setSelected] = useState<string | number | null>(null);

  const filtered = useMemo(() => {
    const active = columns.filter((c) => filters[c.key]?.trim());
    const result = rows.filter(
      (row) => (!search.trim() || columns.some((c) => includes(c.value(row), search))) && active.every((c) => includes(c.value(row), filters[c.key])),
    );
    const column = columns.find((c) => c.key === sort.key) ?? columns[0];
    const key = column.sortValue ?? column.value;
    result.sort((a, b) => key(a).localeCompare(key(b), "de", { sensitivity: "base", numeric: true }) * (sort.desc ? -1 : 1));
    return result;
  }, [rows, columns, search, filters, sort]);

  const pages = Math.max(1, Math.ceil(filtered.length / pageSize));
  const current = Math.min(page, pages - 1);
  const visible = filtered.slice(current * pageSize, (current + 1) * pageSize);
  const selectedRow = selected === null ? undefined : rows.find((r) => rowKey(r) === selected);
  // Bei festen Spaltenbreiten scrollt die Tabelle seitlich, statt die Spalten zu quetschen
  const minWidth = columns.reduce((sum, c) => sum + (c.width ?? 140), 0);

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
        <span className="flex-1" />
        <Button variant="outline" size="sm" onClick={exportCsv} title="Als CSV exportieren (Excel)" aria-label="Als CSV exportieren">
          <FileSpreadsheet aria-hidden />
        </Button>
        <div className="relative w-full max-w-60">
          <Search className="pointer-events-none absolute left-2.5 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" aria-hidden />
          <Input value={search} onChange={(e) => { setSearch(e.target.value); setPage(0); }} placeholder="Suchen …" aria-label="Suchen" className="h-8 pl-8" />
        </div>
      </div>
      <div className={cn("scroll-thin", compact ? "max-h-[28rem]" : "min-h-0 flex-1")} data-testid="table-scroll">
        {/* border-separate: Bei border-collapse bleiben die Linien im festgehaltenen Kopf nicht stehen, dann scheinen Zeilen durch */}
        <table className="w-full table-fixed border-separate border-spacing-0 text-sm" style={{ minWidth }}>
          <colgroup>
            {columns.map((c) => (
              <col key={c.key} style={c.width ? { width: c.width } : undefined} />
            ))}
          </colgroup>
          <thead className="sticky top-0 z-[1] bg-card">
            <tr className="text-left text-muted-foreground">
              {columns.map((c) => (
                <th key={c.key} className={cn("truncate border-b bg-card px-3 py-2 font-medium", c.className)} title={c.label} aria-sort={sort.key === c.key ? (sort.desc ? "descending" : "ascending") : undefined}>
                  <button type="button" className="inline-flex items-center gap-1 transition-colors duration-150 hover:text-foreground" onClick={() => setSort((s) => ({ key: c.key, desc: s.key === c.key ? !s.desc : false }))}>
                    {c.label}
                    {sort.key === c.key && (sort.desc ? <ArrowDown className="size-3.5" aria-hidden /> : <ArrowUp className="size-3.5" aria-hidden />)}
                  </button>
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
                      className="h-7 border-transparent pl-7 shadow-none focus-visible:border-input"
                    />
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
                  onClick={() => setSelected(isSelected ? null : key)}
                  onDoubleClick={() => {
                    setSelected(key);
                    onOpen?.(row);
                  }}
                  className={cn(
                    "cursor-pointer transition-colors duration-100",
                    isSelected ? "bg-brand text-brand-foreground" : "odd:bg-muted hover:bg-accent",
                  )}
                >
                  {columns.map((c) => {
                    const text = c.value(row);
                    return (
                      <td key={c.key} title={text} className={cn("truncate border-b px-3 py-1.5", c.className)}>{text}</td>
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
