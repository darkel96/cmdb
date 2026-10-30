import { useEffect, useMemo, useState } from "react";
import { Archive, CalendarClock, Search } from "lucide-react";
import { useNavigate } from "react-router";
import { DataTable, type Column } from "@/components/DataTable";
import { Combobox } from "@/components/ui/combobox";
import { Input } from "@/components/ui/input";
import { ClearButton } from "@/components/ui/clear-button";
import { api } from "@/lib/api";
import { AREAS, SYSTEM_STATUS, type Area, type AreaRow } from "@/lib/areas";
import { cn } from "@/lib/utils";
import { deDate, EXPIRING_MONTHS, expiringWindow, inExpiringWindow } from "@/lib/expiring";
import { useSessionState } from "@/lib/sessionView";
import { useAuth } from "@/state/auth";

/** Bereiche in der Reihenfolge wie in GAPTEQ („Auslaufende Kundensysteme“) */
export const EXPIRING_AREAS = ["server", "switche", "storage", "vmware", "tsplus", "prtg", "veeam", "kepware", "windows"];

/** Status, mit denen ein System erledigt ist und ins Archiv wandert */
export const ARCHIVE_STATUS = ["Verlängert", "Abgeschlossen"];

const shortDate = (iso: string) => (iso ? `${iso.slice(8, 10)}.${iso.slice(5, 7)}.${iso.slice(2, 4)}` : "");

const areaName = (a: Area) => a.plural ?? a.title.replace(/^Übersicht /, "");
const isEol = (row: AreaRow) => String(row.eol ?? "").toLowerCase() === "ja";
const isArchived = (row: AreaRow) => ARCHIVE_STATUS.includes(String(row.status ?? ""));
const statusOf = (row: AreaRow) => String(row.status ?? "").trim();

/** Status-Filter für die ganze Seite: im Reiter „Offen“ ohne Status / Angeboten / In Bearbeitung, im Archiv die Abschlüsse */
const NO_STATUS = "";
const statusFilters = (archive: boolean) => (archive ? ARCHIVE_STATUS : [NO_STATUS, ...SYSTEM_STATUS.filter((s) => !ARCHIVE_STATUS.includes(s))]);
const statusLabel = (status: string) => (status === NO_STATUS ? "Ohne Status" : status);
const text = (row: AreaRow, ...keys: string[]) => keys.map((k) => String(row[k] ?? "").trim()).find(Boolean) ?? "";

/** Ein System aus irgendeinem Bereich, für die gemeinsame Tabelle */
interface Item {
  key: string;
  area: Area;
  row: AreaRow;
}

type Result = { rows: AreaRow[] } | { error: string };

/** Ab Desktop-Breite (lg) feste Höhe mit scrollender Tabelle; darunter scrollt die Seite und die Tabelle ist kompakt */
function useWide(): boolean {
  const query = "(min-width: 1024px)";
  const [wide, setWide] = useState(() => window.matchMedia(query).matches);
  useEffect(() => {
    const m = window.matchMedia(query);
    const update = () => setWide(m.matches);
    m.addEventListener("change", update);
    return () => m.removeEventListener("change", update);
  }, []);
  return wide;
}

function StatusCell({ item, editable, onSaved }: { item: Item; editable: boolean; onSaved: (row: AreaRow) => void }) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const current = String(item.row.status ?? "");
  if (!editable) return <>{current}</>;
  return (
    // Klicks in der Auswahl markieren oder öffnen die Zeile nicht
    <span className="block" onClick={(e) => e.stopPropagation()} onDoubleClick={(e) => e.stopPropagation()} title={error || undefined}>
      <Combobox
        value={current}
        label={`Status ${item.area.singular} ${item.row.id}`}
        options={SYSTEM_STATUS.includes(current) || !current ? SYSTEM_STATUS : [current, ...SYSTEM_STATUS]}
        placeholder="– offen –"
        disabled={busy}
        invalid={Boolean(error)}
        className="h-7 bg-card text-foreground md:text-xs"
        onChange={async (status) => {
          if (status === current) return;
          setBusy(true);
          setError("");
          try {
            await api.setStatus(item.area.id, item.row.id, status, current);
            onSaved({ ...item.row, status });
          } catch (e) {
            setError(e instanceof Error ? e.message : String(e));
          } finally {
            setBusy(false);
          }
        }}
      />
    </span>
  );
}

/**
 * Auslaufende Kundensysteme: links die Kunden, rechts alle Systeme aller Bereiche in einer Tabelle (kein Scrollen über
 * acht Tabellen). Status direkt in der Zeile; Verlängert und Abgeschlossen wandern ins Archiv.
 */
export function ExpiringPage() {
  const navigate = useNavigate();
  const { can } = useAuth();
  const areas = useMemo(() => EXPIRING_AREAS.filter((id) => can(id, "read")).map((id) => AREAS[id]), [can]);
  const [results, setResults] = useState<Record<string, Result>>({});
  // Ansicht für die Sitzung merken: nach Öffnen eines Systems und „Zurück“ bleibt alles wie es war
  const [archive, setArchive] = useSessionState("auslaufend", "archive", false);
  const [customer, setCustomer] = useSessionState<string | null>("auslaufend", "customer", null);
  const [customerSearch, setCustomerSearch] = useSessionState("auslaufend", "customerSearch", "");
  const [hiddenList, setHiddenList] = useSessionState<string[]>("auslaufend", "hidden", []);
  const hidden = useMemo(() => new Set(hiddenList), [hiddenList]);
  // null = alle Status
  const [status, setStatus] = useSessionState<string | null>("auslaufend", "status", null);
  // Regel: Support-Ende in den nächsten 9 Monaten oder abgelaufen (src/lib/expiring.ts)
  const window = useMemo(() => expiringWindow(), []);
  const wide = useWide();

  useEffect(() => {
    for (const area of areas) {
      api.area(area.id).then(
        (d) => setResults((r) => ({ ...r, [area.id]: { rows: d.items.filter((row) => inExpiringWindow(String(row.supportUntil ?? ""), window)) } })),
        (e: unknown) => setResults((r) => ({ ...r, [area.id]: { error: e instanceof Error ? e.message : String(e) } })),
      );
    }
  }, [areas, window]);

  const loading = areas.some((a) => !results[a.id]);
  const errors = areas.flatMap((a) => {
    const r = results[a.id];
    return r && "error" in r ? [`${areaName(a)}: ${r.error}`] : [];
  });

  // Alle Systeme des gewählten Reiters (offen oder Archiv)
  const inTab = useMemo(
    () =>
      areas.flatMap((area) => {
        const r = results[area.id];
        return r && "rows" in r ? r.rows.filter((row) => isArchived(row) === archive).map((row): Item => ({ key: `${area.id}:${row.id}`, area, row })) : [];
      }),
    [areas, results, archive],
  );
  // Andere Werte (z. B. aus GAPTEQ) zählen unter „Alle“, haben aber keinen eigenen Filter
  const perStatus = (s: string) => inTab.filter((i) => statusOf(i.row) === s).length;
  // Der Status-Filter gilt für die ganze Seite: Kundenliste, Bereiche und Tabelle
  const all = useMemo(() => (status === null ? inTab : inTab.filter((i) => statusOf(i.row) === status)), [inTab, status]);
  const counts = useMemo(() => {
    let open = 0;
    let archived = 0;
    for (const r of Object.values(results)) if ("rows" in r) for (const row of r.rows) isArchived(row) ? archived++ : open++;
    return { open, archived };
  }, [results]);

  const customers = useMemo(() => {
    const map = new Map<string, { name: string; count: number; eol: number }>();
    for (const { row } of all) {
      const name = String(row.company ?? "").trim();
      if (!name) continue;
      const c = map.get(name) ?? { name, count: 0, eol: 0 };
      c.count++;
      if (isEol(row)) c.eol++;
      map.set(name, c);
    }
    return [...map.values()].sort((a, b) => a.name.localeCompare(b.name, "de"));
  }, [all]);
  const shownCustomers = customers.filter((c) => c.name.toLocaleLowerCase("de").includes(customerSearch.trim().toLocaleLowerCase("de")));

  const ofCustomer = customer ? all.filter((i) => String(i.row.company ?? "").trim() === customer) : all;
  const items = ofCustomer.filter((i) => !hidden.has(i.area.id));
  const perArea = (id: string) => ofCustomer.filter((i) => i.area.id === id).length;

  const saved = (areaId: string, row: AreaRow) =>
    setResults((r) => {
      const current = r[areaId];
      return "rows" in current ? { ...r, [areaId]: { rows: current.rows.map((x) => (x.id === row.id ? row : x)) } } : r;
    });

  const columns: Column<Item>[] = [
    { key: "area", label: "Bereich", value: (i) => areaName(i.area), width: 120 },
    { key: "id", label: "ID", value: (i) => String(i.row.id), width: 80, className: "tabular-nums" },
    { key: "company", label: "Firma", value: (i) => String(i.row.company ?? "") },
    // Bezeichnung und Kennung je nach Bereich aus dem passenden Feld
    { key: "name", label: "Bezeichnung", value: (i) => text(i.row, "model", "licenseType", "product", "hostname", "function", "manufacturer") || (i.row.sensorCount ? `${i.row.sensorCount} Sensoren` : "") },
    { key: "tag", label: "Servicetag / Lizenz", value: (i) => text(i.row, "serviceTag", "license", "licenseKey", "ipAddress", "orderNumber"), width: 170 },
    { key: "supportUntil", label: "Support bis", value: (i) => shortDate(String(i.row.supportUntil ?? "")), sortValue: (i) => String(i.row.supportUntil ?? ""), width: 100, className: "tabular-nums" },
    { key: "eol", label: "EOL", value: (i) => String(i.row.eol ?? ""), width: 60 },
    {
      key: "status",
      label: "Status",
      value: (i) => String(i.row.status ?? ""),
      width: 170,
      render: (i) => <StatusCell key={i.key} item={i} editable={can("auslaufend", "edit")} onSaved={(row) => saved(i.area.id, row)} />,
    },
    { key: "notes", label: "Besonderheiten", value: (i) => String(i.row.notes ?? "") },
  ];

  if (!can("auslaufend", "read")) return <p className="text-sm text-muted-foreground">Dafür fehlt die Berechtigung (Auslaufende Kundensysteme: Lesen).</p>;

  const tab = (active: boolean) =>
    cn(
      "inline-flex h-8 items-center gap-2 rounded-md px-3 text-sm font-medium transition-colors duration-150",
      active ? "bg-card text-foreground shadow-xs" : "text-muted-foreground hover:text-foreground",
    );

  return (
    <div className="flex flex-col gap-3 lg:min-h-0 lg:flex-1">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold">Auslaufende Kundensysteme</h1>
          <p className="text-sm text-muted-foreground">
            Support-Ende bis {deDate(window.to)} (nächste {EXPIRING_MONTHS} Monate) oder abgelaufen · rot: EOL = Ja · Verlängert und Abgeschlossen stehen im Archiv
          </p>
        </div>
        <div role="tablist" aria-label="Ansicht" className="inline-flex rounded-lg bg-muted p-1">
          <button type="button" role="tab" aria-selected={!archive} className={tab(!archive)} onClick={() => { setArchive(false); setCustomer(null); setStatus(null); }}>
            <CalendarClock className="size-4" aria-hidden />
            Offen
            <span className="rounded bg-muted px-1.5 text-xs tabular-nums">{loading ? "…" : counts.open}</span>
          </button>
          <button type="button" role="tab" aria-selected={archive} className={tab(archive)} onClick={() => { setArchive(true); setCustomer(null); setStatus(null); }}>
            <Archive className="size-4" aria-hidden />
            Archiv
            <span className="rounded bg-muted px-1.5 text-xs tabular-nums">{loading ? "…" : counts.archived}</span>
          </button>
        </div>
      </div>
      {/* Status-Filter für die ganze Seite */}
      <div className="flex flex-wrap items-center gap-1.5" role="group" aria-label="Nach Status filtern">
        <span className="mr-1 text-xs font-medium text-muted-foreground">Status</span>
        {[null, ...statusFilters(archive)].map((s) => {
          const active = status === s;
          return (
            <button
              key={s ?? "alle"}
              type="button"
              aria-pressed={active}
              onClick={() => setStatus(s)}
              className={cn(
                "inline-flex h-7 items-center gap-1.5 rounded-full border px-2.5 text-xs font-medium transition-colors duration-150",
                active ? "border-brand bg-brand text-brand-foreground" : "bg-card text-muted-foreground hover:border-brand hover:text-foreground",
              )}
            >
              {s === null ? "Alle" : statusLabel(s)}
              <span className="tabular-nums opacity-80">{loading ? "…" : s === null ? inTab.length : perStatus(s)}</span>
            </button>
          );
        })}
      </div>
      {errors.length > 0 && <p role="alert" className="text-sm text-destructive">Nicht geladen: {errors.join(" · ")}</p>}

      <div className="grid gap-3 lg:min-h-0 lg:flex-1 lg:grid-cols-[17rem_minmax(0,1fr)]">
        {/* Kunden: wählen filtert die Tabelle rechts */}
        <section aria-label="Kunden" className="animate-appear flex max-h-72 min-h-0 flex-col overflow-hidden rounded-lg border bg-card shadow-xs lg:max-h-none">
          {/* Suche und „Alle Kunden“ bleiben stehen, nur die Kunden darunter scrollen */}
          <div className="flex flex-col gap-1 border-b p-2">
            <div className="relative">
              <Search className="pointer-events-none absolute left-2.5 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" aria-hidden />
              <Input value={customerSearch} onChange={(e) => setCustomerSearch(e.target.value)} placeholder="Kunde suchen …" aria-label="Kunde suchen" className="h-8 pr-8 pl-8" />
              <ClearButton value={customerSearch} label="Kundensuche löschen" onClear={() => setCustomerSearch("")} />
            </div>
            <button
              type="button"
              aria-pressed={customer === null}
              onClick={() => setCustomer(null)}
              className={cn("flex w-full items-center justify-between gap-2 rounded-md px-2.5 py-1.5 text-left text-sm font-medium", customer === null ? "bg-brand text-brand-foreground" : "hover:bg-accent")}
            >
              Alle Kunden
              <span className="text-xs tabular-nums opacity-80">{all.length}</span>
            </button>
          </div>
          <ul className="scroll-thin min-h-0 flex-1 p-1" aria-label="Kundenliste">
            {shownCustomers.map((c) => (
              <li key={c.name}>
                <button
                  type="button"
                  aria-pressed={customer === c.name}
                  onClick={() => setCustomer(c.name)}
                  title={c.name}
                  className={cn("flex w-full items-center justify-between gap-2 rounded-md px-2.5 py-1.5 text-left text-sm", customer === c.name ? "bg-brand text-brand-foreground" : "hover:bg-accent")}
                >
                  <span className="truncate">{c.name}</span>
                  <span className="flex shrink-0 items-center gap-1 text-xs tabular-nums">
                    {c.eol > 0 && (
                      <span className={cn("rounded px-1", customer === c.name ? "bg-white/20" : "bg-destructive/10 text-destructive")} title={`${c.eol} mit EOL = Ja`}>
                        {c.eol} EOL
                      </span>
                    )}
                    <span className="opacity-80">{c.count}</span>
                  </span>
                </button>
              </li>
            ))}
            {!loading && shownCustomers.length === 0 && <li className="px-2.5 py-2 text-sm text-muted-foreground">Keine Kunden.</li>}
          </ul>
        </section>

        <div className="flex min-w-0 flex-col gap-2 lg:min-h-0">
          {/* Bereiche ein- und ausblenden, mit Anzahl */}
          <div className="flex flex-wrap gap-1.5" role="group" aria-label="Bereiche ein- und ausblenden">
            {areas.filter((a) => !results[a.id] || perArea(a.id) > 0).map((a) => {
              const shown = !hidden.has(a.id);
              return (
                <button
                  key={a.id}
                  type="button"
                  aria-pressed={shown}
                  onClick={() => setHiddenList(shown ? [...hiddenList, a.id] : hiddenList.filter((id) => id !== a.id))}
                  className={cn(
                    "inline-flex h-7 items-center gap-1.5 rounded-full border px-2.5 text-xs font-medium transition-colors duration-150",
                    shown ? "border-brand bg-brand/10 text-brand hover:bg-brand/15" : "bg-card text-muted-foreground line-through hover:border-brand",
                  )}
                >
                  {areaName(a)}
                  <span className="tabular-nums">{results[a.id] ? perArea(a.id) : "…"}</span>
                </button>
              );
            })}
          </div>
          <DataTable
            key={`${archive}:${customer ?? ""}:${status ?? "*"}`}
            viewKey={`auslaufend:${archive}:${customer ?? ""}:${status ?? "*"}`}
            compact={!wide}
            title={`${archive ? "Archiv" : "Offen"} · ${customer ?? "Alle Kunden"}${status === null ? "" : ` · ${statusLabel(status)}`}`}
            columns={columns}
            rows={items}
            rowKey={(i) => i.key}
            exportName={archive ? "auslaufend-archiv" : "auslaufend"}
            emptyText={loading ? "Wird geladen …" : status !== null ? `Keine Systeme mit Status „${statusLabel(status)}“.` : archive ? "Im Archiv ist nichts." : "Keine auslaufenden Systeme."}
            defaultSort={{ key: "supportUntil", desc: false }}
            highlight={(i) => isEol(i.row)}
            onOpen={(i) =>
              navigate(`/bereich/${i.area.id}/${i.row.id}`, { viewTransition: true, state: { back: { to: "/auflistungen/auslaufend", label: "Zurück zu Auslaufende Kundensysteme" } } })
            }
          />
        </div>
      </div>
    </div>
  );
}
