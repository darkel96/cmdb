import { useEffect, useMemo, useState } from "react";
import { BarChart3, CalendarClock, ChevronRight } from "lucide-react";
import { Link, useNavigate, useParams } from "react-router";
import { api } from "@/lib/api";
import { AREAS, type AreaRow } from "@/lib/areas";
import { cn } from "@/lib/utils";
import { useAuth } from "@/state/auth";
import { EXPIRING_AREAS } from "./ExpiringPage";
import { NotFoundPage } from "./NotFoundPage";

interface Report {
  id: string;
  title: string;
  description: string;
  area: string;
  field: string;
  unit: string;
  /** "count": nach Anzahl, "value": nach Wert (z. B. Versionen numerisch) */
  sort: "count" | "value";
}

/** Auflistungen wie in GAPTEQ (Admin › Auflistungen) */
export const REPORTS: Report[] = [
  { id: "oracle-systeme", title: "Aufstellung Oracle-Systeme", description: "Oracle-Datenbanken nach DB-Typ", area: "oracle", field: "dbType", unit: "Systeme", sort: "count" },
  { id: "oracle-versionen", title: "Aufstellung Oracle-Versionen", description: "Oracle-Datenbanken nach Version", area: "oracle", field: "dbVersion", unit: "Systeme", sort: "value" },
  { id: "server", title: "Aufstellung Server", description: "Server nach Servertyp", area: "server", field: "serverType", unit: "Server", sort: "count" },
];

const EMPTY = "(leer)";

/** Übersicht der Auflistungen als Kacheln */
export function ReportsIndex() {
  const { can } = useAuth();
  const tiles = [
    ...(can("auslaufend", "read") && EXPIRING_AREAS.some((id) => can(id, "read"))
      ? [{ id: "auslaufend", title: "Auslaufende Kundensysteme", description: "Support endet bis Ende des dritten Monats oder ist abgelaufen", icon: CalendarClock }]
      : []),
    ...REPORTS.filter((r) => can(r.area, "read")).map((r) => ({ ...r, icon: BarChart3 })),
  ];
  return (
    <section className="flex w-full flex-col gap-4" aria-label="Auflistungen">
      <h1 className="animate-appear rounded-lg bg-brand px-4 py-2.5 text-lg font-medium text-brand-foreground shadow-xs">Auflistungen</h1>
      <ul className="grid grid-cols-[repeat(auto-fill,minmax(16rem,1fr))] gap-3">
        {tiles.map((r, i) => (
          <li key={r.id} className="contents">
            <Link
              to={`/auflistungen/${r.id}`}
              viewTransition
              style={{ "--i": i } as React.CSSProperties}
              className="group animate-appear flex min-h-28 flex-col justify-between gap-3 rounded-lg border bg-card p-4 shadow-xs transition-[box-shadow,border-color,transform] duration-200 ease-out hover:-translate-y-0.5 hover:border-brand hover:shadow-md"
            >
              <span className="flex size-10 items-center justify-center rounded-md bg-brand/10 text-brand">
                <r.icon className="size-5" aria-hidden />
              </span>
              <span className="flex flex-col">
                <span className="flex items-center justify-between gap-2 font-medium">
                  {r.title}
                  <ChevronRight className="size-4 text-brand transition-transform duration-200 group-hover:translate-x-0.5" aria-hidden />
                </span>
                <span className="text-xs text-muted-foreground">{r.description}</span>
              </span>
            </Link>
          </li>
        ))}
      </ul>
    </section>
  );
}

function compareVersions(a: string, b: string): number {
  return a.localeCompare(b, "de", { numeric: true });
}

/**
 * Eine Auflistung: Gesamtzahl als eigene Kennzahl (nicht als Balken, der die übrigen staucht), darunter waagrechte
 * Balken je Wert. Ein Klick auf einen Balken öffnet die Übersicht, gefiltert auf diesen Wert.
 */
export function ReportPage() {
  const { reportId = "" } = useParams();
  const navigate = useNavigate();
  const report = REPORTS.find((r) => r.id === reportId);
  const [rows, setRows] = useState<AreaRow[] | null>(null);
  const [error, setError] = useState("");

  useEffect(() => {
    if (!report) return;
    api.area(report.area).then((d) => setRows(d.items), (e: unknown) => setError(e instanceof Error ? e.message : String(e)));
  }, [report]);

  const groups = useMemo(() => {
    if (!report || !rows) return [];
    const counts = new Map<string, number>();
    for (const r of rows) {
      const v = String(r[report.field] ?? "").trim() || EMPTY;
      counts.set(v, (counts.get(v) ?? 0) + 1);
    }
    const list = [...counts].map(([label, count]) => ({ label, count }));
    return list.sort((a, b) => (report.sort === "count" ? b.count - a.count || a.label.localeCompare(b.label, "de") : compareVersions(a.label, b.label)));
  }, [report, rows]);

  if (!report) return <NotFoundPage />;
  const area = AREAS[report.area];
  const max = Math.max(1, ...groups.map((g) => g.count));
  const field = area.fields.find((f) => f.key === report.field);

  return (
    <div className="flex w-full flex-col gap-4">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold">{report.title}</h1>
          <p className="text-sm text-muted-foreground">{report.description} · Klick auf einen Balken öffnet die gefilterte Übersicht</p>
        </div>
        <Link to="/bereich/auflistungen" viewTransition className="text-sm text-brand underline-offset-4 hover:underline">
          Alle Auflistungen
        </Link>
      </div>
      {error && <p role="alert" className="rounded-md border border-destructive/30 bg-destructive/10 px-4 py-3 text-sm text-destructive">{error}</p>}
      {!rows && !error && <p className="text-sm text-muted-foreground">Wird geladen …</p>}
      {rows && (
        <>
          <div className="animate-appear flex w-fit flex-col rounded-lg border bg-card px-5 py-3 shadow-xs" data-testid="report-total">
            <span className="text-xs text-muted-foreground">Gesamt</span>
            <span className="text-3xl font-semibold tabular-nums">{rows.length}</span>
            <span className="text-xs text-muted-foreground">
              {report.unit} · {groups.length} {groups.length === 1 ? "Wert" : "Werte"}
            </span>
          </div>
          <section className="animate-appear overflow-hidden rounded-lg border bg-card shadow-xs" aria-label={report.title}>
            <h2 className="bg-brand px-4 py-2.5 text-lg font-medium text-brand-foreground">
              Anzahl {report.unit} je {field?.label ?? report.field}
            </h2>
            <ul className="flex flex-col gap-0.5 p-4" aria-label={`${report.unit} je ${field?.label ?? report.field}`}>
              {groups.map((g) => (
                <li key={g.label}>
                  <button
                    type="button"
                    className="group grid w-full grid-cols-[minmax(8rem,14rem)_1fr_3rem] items-center gap-3 rounded-md px-2 py-1 text-left text-sm transition-colors duration-100 hover:bg-accent"
                    title={`${g.label}: ${g.count} ${report.unit} – Übersicht öffnen`}
                    aria-label={`${g.label}: ${g.count}`}
                    onClick={() =>
                      navigate(`/bereich/${report.area}?${new URLSearchParams({ [`filter.${report.field}`]: `"${g.label === EMPTY ? "" : g.label}"` })}`, { viewTransition: true })
                    }
                  >
                    <span className={cn("truncate", g.label === EMPTY && "text-muted-foreground")}>{g.label}</span>
                    <span className="flex h-5 items-center">
                      {/* Balken: dünn, abgerundetes Ende, an der Grundlinie links verankert */}
                      <span
                        className="h-3.5 rounded-r-[4px] bg-brand transition-[filter] duration-100 group-hover:brightness-90"
                        style={{ width: `${Math.max(1, (g.count / max) * 100)}%` }}
                      />
                    </span>
                    <span className="text-right tabular-nums text-muted-foreground">{g.count}</span>
                  </button>
                </li>
              ))}
            </ul>
          </section>
        </>
      )}
    </div>
  );
}
