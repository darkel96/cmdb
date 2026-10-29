import { useEffect, useMemo, useState } from "react";
import { BarChart3, CalendarClock, ChevronRight } from "lucide-react";
import { NavLink, useNavigate, useParams } from "react-router";
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
  /** Anfangs-Sortierung: "count" nach Anzahl, "value" nach Wert (Versionen numerisch) */
  sort: "count" | "value";
  /** Werte zu Gruppen zusammenfassen (z. B. Oracle-Hauptversion); Filter beim Klick als Präfix */
  group?: { label: string; of: (value: string) => string };
}

/** Oracle: 11.2 und 12.1/12.2 sind eigene Hauptversionen, ab 18 zählt die erste Zahl */
const oracleMajor = (v: string) => {
  const [a, b] = v.split(".");
  return Number(a) <= 12 && b !== undefined ? `${a}.${b}` : a;
};

/** Auflistungen wie in GAPTEQ (Admin › Auflistungen) */
export const REPORTS: Report[] = [
  { id: "oracle-systeme", title: "Aufstellung Oracle-Systeme", description: "Oracle-Datenbanken nach DB-Typ", area: "oracle", field: "dbType", unit: "Systeme", sort: "count" },
  {
    id: "oracle-versionen",
    title: "Aufstellung Oracle-Versionen",
    description: "Oracle-Datenbanken nach Version",
    area: "oracle",
    field: "dbVersion",
    unit: "Systeme",
    sort: "value",
    group: { label: "Nach Hauptversion", of: oracleMajor },
  },
  { id: "server", title: "Aufstellung Server", description: "Server nach Servertyp", area: "server", field: "serverType", unit: "Server", sort: "count" },
];

const EMPTY = "(leer)";
const compareVersions = (a: string, b: string) => a.localeCompare(b, "de", { numeric: true });

/** Linke Liste der Auflistungen (wie Stammdaten); Auslaufende Kundensysteme als eigene Seite */
function ReportsNav() {
  const { can } = useAuth();
  const items = [
    ...REPORTS.filter((r) => can(r.area, "read")).map((r) => ({ id: r.id, title: r.title, icon: BarChart3 })),
    ...(can("auslaufend", "read") && EXPIRING_AREAS.some((id) => can(id, "read")) ? [{ id: "auslaufend", title: "Auslaufende Kundensysteme", icon: CalendarClock }] : []),
  ];
  return (
    <nav aria-label="Auflistungen" className="animate-appear self-start overflow-hidden rounded-lg border bg-card p-1 shadow-xs">
      <ul className="flex flex-col gap-0.5">
        {items.map((r) => (
          <li key={r.id}>
            <NavLink
              to={`/auflistungen/${r.id}`}
              viewTransition
              className={({ isActive }) =>
                cn("flex items-center gap-2 rounded-md px-3 py-2 text-sm transition-colors duration-100", isActive ? "bg-brand text-brand-foreground" : "hover:bg-accent")
              }
            >
              <r.icon className="size-4 shrink-0 opacity-80" aria-hidden />
              <span className="flex-1 truncate">{r.title}</span>
              {r.id === "auslaufend" && <ChevronRight className="size-4 opacity-60" aria-hidden />}
            </NavLink>
          </li>
        ))}
      </ul>
    </nav>
  );
}

function Layout({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex w-full flex-col gap-3">
      <h1 className="text-2xl font-semibold">Auflistungen</h1>
      <div className="grid gap-4 md:grid-cols-[18rem_minmax(0,1fr)]">
        <ReportsNav />
        {children}
      </div>
    </div>
  );
}

/** Seitenleiste „Auflistungen“: Liste links, rechts die erste lesbare Auflistung */
export function ReportsIndex() {
  const { can } = useAuth();
  const first = REPORTS.find((r) => can(r.area, "read"));
  return <Layout>{first ? <ReportCard report={first} /> : <p className="text-sm text-muted-foreground">Keine Auflistung mit Leserecht.</p>}</Layout>;
}

/** Eine Auflistung: Gesamtzahl und schmale Balken je Wert; Klick öffnet die gefilterte Übersicht */
function ReportCard({ report }: { report: Report }) {
  const navigate = useNavigate();
  const [rows, setRows] = useState<AreaRow[] | null>(null);
  const [error, setError] = useState("");
  const [sort, setSort] = useState(report.sort);
  const [grouped, setGrouped] = useState(false);

  useEffect(() => {
    setRows(null);
    setError("");
    setSort(report.sort);
    setGrouped(false);
    api.area(report.area).then((d) => setRows(d.items), (e: unknown) => setError(e instanceof Error ? e.message : String(e)));
  }, [report]);

  const groups = useMemo(() => {
    if (!rows) return [];
    const counts = new Map<string, number>();
    for (const r of rows) {
      const raw = String(r[report.field] ?? "").trim();
      const v = !raw ? EMPTY : grouped && report.group ? report.group.of(raw) : raw;
      counts.set(v, (counts.get(v) ?? 0) + 1);
    }
    const list = [...counts].map(([label, count]) => ({ label, count }));
    return list.sort((a, b) => (sort === "count" ? b.count - a.count || compareVersions(a.label, b.label) : compareVersions(a.label, b.label)));
  }, [report, rows, sort, grouped]);

  const area = AREAS[report.area];
  const field = area.fields.find((f) => f.key === report.field);
  const total = rows?.length ?? 0;
  const max = Math.max(1, ...groups.map((g) => g.count));

  const open = (label: string) => {
    // Einzelwert: genau dieser Wert; Hauptversion: alle Versionen, die damit beginnen
    const filter = label === EMPTY ? '""' : grouped && report.group ? `${label}.` : `"${label}"`;
    navigate(`/bereich/${report.area}?${new URLSearchParams({ [`filter.${report.field}`]: filter })}`, { viewTransition: true });
  };

  const chip = (active: boolean) =>
    cn("rounded-md px-2.5 py-1 text-xs font-medium transition-colors duration-100", active ? "bg-card text-foreground shadow-xs" : "text-muted-foreground hover:text-foreground");

  return (
    <section className="animate-appear flex min-w-0 flex-col overflow-hidden rounded-lg border bg-card shadow-xs" aria-label={report.title}>
      <div className="flex flex-wrap items-start gap-x-6 gap-y-3 border-b px-5 py-4">
        <div className="mr-auto">
          <h2 className="text-lg font-semibold">{report.title}</h2>
          <p className="text-sm text-muted-foreground">{report.description} · Klick auf einen Balken öffnet die gefilterte Übersicht</p>
        </div>
        {rows && (
          <div className="flex items-baseline gap-2" data-testid="report-total">
            <span className="text-3xl font-semibold tabular-nums">{total}</span>
            <span className="text-sm text-muted-foreground">
              {report.unit} · {groups.length} {groups.length === 1 ? "Wert" : "Werte"}
            </span>
          </div>
        )}
      </div>
      {rows && (
        <div className="flex flex-wrap items-center gap-2 border-b px-5 py-2">
          <span className="text-xs text-muted-foreground">Sortieren</span>
          <div className="inline-flex rounded-md bg-muted p-0.5" role="group" aria-label="Sortieren">
            <button type="button" className={chip(sort === "count")} aria-pressed={sort === "count"} onClick={() => setSort("count")}>
              nach Anzahl
            </button>
            <button type="button" className={chip(sort === "value")} aria-pressed={sort === "value"} onClick={() => setSort("value")}>
              nach {field?.label ?? "Wert"}
            </button>
          </div>
          {report.group && (
            <label className="ml-2 flex cursor-pointer items-center gap-2 text-xs">
              <input type="checkbox" className="size-4 accent-[var(--brand)]" checked={grouped} onChange={(e) => setGrouped(e.target.checked)} />
              {report.group.label} zusammenfassen
            </label>
          )}
        </div>
      )}
      {error && <p role="alert" className="px-5 py-3 text-sm text-destructive">{error}</p>}
      {!rows && !error && <p className="px-5 py-3 text-sm text-muted-foreground">Wird geladen …</p>}
      {rows && (
        // Lange Listen (z. B. 29 Versionen) scrollen in der Karte, die Karte endet am Fensterrand
        <ul className="scroll-thin flex max-h-[calc(100svh-17rem)] flex-col gap-0.5 px-3 py-3" aria-label={`${report.unit} je ${field?.label ?? report.field}`}>
          {groups.map((g) => {
            const share = total ? Math.round((g.count / total) * 100) : 0;
            return (
              <li key={g.label}>
                <button
                  type="button"
                  className="group grid w-full grid-cols-[minmax(7rem,12rem)_1fr] items-center gap-3 rounded-md px-2 py-1.5 text-left text-sm transition-colors duration-100 hover:bg-accent"
                  title={`${g.label}: ${g.count} ${report.unit} (${share} %) – Übersicht öffnen`}
                  aria-label={`${g.label}: ${g.count}`}
                  onClick={() => open(g.label)}
                >
                  <span className={cn("truncate", g.label === EMPTY && "text-muted-foreground")}>{g.label}</span>
                  {/* Spur über die volle Breite, Balken mit abgerundetem Ende, Zahl direkt dahinter */}
                  <span className="flex items-center gap-2">
                    <span className="relative h-2.5 flex-1 rounded-full bg-muted">
                      <span
                        className="absolute inset-y-0 left-0 rounded-full bg-brand transition-[filter] duration-100 group-hover:brightness-90"
                        style={{ width: `${Math.max(1.5, (g.count / max) * 100)}%` }}
                      />
                    </span>
                    <span className="w-20 shrink-0 text-right tabular-nums">
                      {g.count}
                      <span className="ml-1.5 text-xs text-muted-foreground">{share} %</span>
                    </span>
                  </span>
                </button>
              </li>
            );
          })}
        </ul>
      )}
    </section>
  );
}

export function ReportPage() {
  const { reportId = "" } = useParams();
  const report = REPORTS.find((r) => r.id === reportId);
  if (!report) return <NotFoundPage />;
  return (
    <Layout>
      <ReportCard report={report} />
    </Layout>
  );
}

