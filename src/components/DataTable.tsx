import { useMemo, useState } from "react";
import { ArrowDown, ArrowUp, ChevronLeft, ChevronRight, FileSpreadsheet, Search } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";

export interface Column<T> {
  key: string;
  label: string;
  value: (row: T) => string;
  className?: string;
}

const PAGE_SIZES = [10, 20, 30, 100];

function includes(haystack: string, needle: string): boolean {
  return haystack.toLocaleLowerCase("de").includes(needle.trim().toLocaleLowerCase("de"));
}

function csvCell(value: string): string {
  return /[";\n]/.test(value) ? `"${value.replace(/"/g, '""')}"` : value;
}

/** Tabelle wie in der bisherigen Anwendung: Suche, Filter je Spalte, Sortierung, Seitengrösse, Blättern und Export */
export function DataTable<T>({ title, columns, rows, rowKey, exportName, emptyText = "Keine Einträge." }: {
  title: string;
  columns: Column<T>[];
  rows: T[];
  rowKey: (row: T) => string | number;
  exportName: string;
  emptyText?: string;
}) {
  const [search, setSearch] = useState("");
  const [filters, setFilters] = useState<Record<string, string>>({});
  const [sort, setSort] = useState<{ key: string; desc: boolean }>({ key: columns[0].key, desc: false });
  const [pageSize, setPageSize] = useState(30);
  const [page, setPage] = useState(0);

  const filtered = useMemo(() => {
    const active = columns.filter((c) => filters[c.key]?.trim());
    const result = rows.filter(
      (row) => (!search.trim() || columns.some((c) => includes(c.value(row), search))) && active.every((c) => includes(c.value(row), filters[c.key])),
    );
    const column = columns.find((c) => c.key === sort.key) ?? columns[0];
    result.sort((a, b) => column.value(a).localeCompare(column.value(b), "de", { sensitivity: "base", numeric: true }) * (sort.desc ? -1 : 1));
    return result;
  }, [rows, columns, search, filters, sort]);

  const pages = Math.max(1, Math.ceil(filtered.length / pageSize));
  const current = Math.min(page, pages - 1);
  const visible = filtered.slice(current * pageSize, (current + 1) * pageSize);

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
    <section className="flex min-h-0 flex-col overflow-hidden rounded-lg border bg-card shadow-xs" aria-label={title}>
      {/* Titel, Suche, Spaltenköpfe und Blättern bleiben stehen; nur die Zeilen scrollen */}
      <h1 className="shrink-0 bg-brand px-4 py-2.5 text-lg font-medium text-brand-foreground">{title}</h1>
      <div className="flex shrink-0 items-center justify-end gap-2 border-b px-3 py-2">
        <Button variant="outline" size="sm" onClick={exportCsv} title="Als CSV exportieren (Excel)" aria-label="Als CSV exportieren">
          <FileSpreadsheet aria-hidden />
        </Button>
        <div className="relative w-full max-w-60">
          <Search className="pointer-events-none absolute left-2.5 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" aria-hidden />
          <Input value={search} onChange={(e) => { setSearch(e.target.value); setPage(0); }} placeholder="Suchen …" aria-label="Suchen" className="h-8 pl-8" />
        </div>
      </div>
      <div className="min-h-0 flex-1 overflow-auto" data-testid="table-scroll">
        <table className="w-full text-sm">
          <thead className="sticky top-0 z-[1] bg-card shadow-[0_1px_0_var(--border)]">
            <tr className="border-b text-left text-muted-foreground">
              {columns.map((c) => (
                <th key={c.key} className={cn("px-3 py-2 font-medium", c.className)} aria-sort={sort.key === c.key ? (sort.desc ? "descending" : "ascending") : undefined}>
                  <button type="button" className="inline-flex items-center gap-1 hover:text-foreground" onClick={() => setSort((s) => ({ key: c.key, desc: s.key === c.key ? !s.desc : false }))}>
                    {c.label}
                    {sort.key === c.key && (sort.desc ? <ArrowDown className="size-3.5" aria-hidden /> : <ArrowUp className="size-3.5" aria-hidden />)}
                  </button>
                </th>
              ))}
            </tr>
            <tr className="border-b">
              {columns.map((c) => (
                <th key={c.key} className="px-2 py-1 font-normal">
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
            {visible.map((row) => (
              <tr key={rowKey(row)} className="border-b last:border-0 odd:bg-muted/40 hover:bg-accent">
                {columns.map((c) => (
                  <td key={c.key} className={cn("px-3 py-1.5", c.className)}>{c.value(row)}</td>
                ))}
              </tr>
            ))}
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
          {PAGE_SIZES.map((size) => (
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
