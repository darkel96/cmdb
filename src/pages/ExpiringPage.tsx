import { useEffect, useMemo, useState } from "react";
import { Eye, EyeOff, X } from "lucide-react";
import { useNavigate } from "react-router";
import { DataTable } from "@/components/DataTable";
import { Combobox } from "@/components/ui/combobox";
import { api } from "@/lib/api";
import { AREAS, SYSTEM_STATUS, type Area, type AreaRow } from "@/lib/areas";
import { cn } from "@/lib/utils";
import { useAuth } from "@/state/auth";
import { areaColumns } from "./AreaPage";

/** Bereiche in der Reihenfolge wie in GAPTEQ („Auslaufende Kundensysteme“) */
export const EXPIRING_AREAS = ["server", "switche", "storage", "vmware", "tsplus", "prtg", "veeam", "windows"];

/**
 * Wie GAPTEQ: Support bis ist gesetzt und liegt spätestens im dritten Monat ab jetzt (im Oktober also bis 31. Januar),
 * abgelaufene eingeschlossen. Einträge ohne Datum zählen nicht.
 */
export function expiringBefore(now = new Date()): string {
  const d = new Date(now.getFullYear(), now.getMonth() + 4, 1);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-01`;
}

const lastDay = (iso: string) => {
  const d = new Date(`${iso}T00:00:00`);
  d.setDate(0);
  return d.toLocaleDateString("de-DE", { day: "2-digit", month: "2-digit", year: "numeric" });
};

const areaName = (a: Area) => a.plural ?? a.title.replace(/^Übersicht /, "");
const isEol = (row: AreaRow) => String(row.eol ?? "").toLowerCase() === "ja";

type Result = { rows: AreaRow[] } | { error: string };
interface CustomerSummary {
  name: string;
  count: number;
  eol: number;
  open: number;
}

/** Status der markierten Zeile setzen, wie das Feld „Status“ unter der Server-Tabelle in GAPTEQ */
function StatusPicker({ area, row, onSaved }: { area: Area; row: AreaRow; onSaved: (row: AreaRow) => void }) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const current = String(row.status ?? "");
  useEffect(() => setError(""), [row.id]);
  return (
    <div className="flex items-center gap-2">
      <label htmlFor={`status-${area.id}`} className="text-sm text-muted-foreground">
        Status {row.id}
      </label>
      <div className="w-48">
        <Combobox
          id={`status-${area.id}`}
          value={current}
          options={SYSTEM_STATUS.includes(current) || !current ? SYSTEM_STATUS : [current, ...SYSTEM_STATUS]}
          disabled={busy}
          onChange={async (status) => {
            if (status === current) return;
            setBusy(true);
            setError("");
            try {
              await api.updateAreaRow(area.id, row.id, { status }, { status: current });
              onSaved({ ...row, status });
            } catch (e) {
              setError(e instanceof Error ? e.message : String(e));
            } finally {
              setBusy(false);
            }
          }}
        />
      </div>
      {error && <span role="alert" className="text-xs text-destructive">{error}</span>}
    </div>
  );
}

/**
 * Auslaufende Kundensysteme wie in GAPTEQ: oben die Kunden mit auslaufenden Systemen (Öffnen filtert auf den Kunden),
 * darunter je Bereich eine Tabelle; EOL = Ja rot, Status je System setzbar. Knöpfe blenden Bereiche aus und ein.
 */
export function ExpiringPage() {
  const navigate = useNavigate();
  const { can } = useAuth();
  const areas = useMemo(() => EXPIRING_AREAS.filter((id) => can(id, "read")).map((id) => AREAS[id]), [can]);
  const [results, setResults] = useState<Record<string, Result>>({});
  const [hidden, setHidden] = useState<Set<string>>(new Set());
  const [customer, setCustomer] = useState<string | null>(null);
  const cutoff = expiringBefore();

  useEffect(() => {
    for (const area of areas) {
      api.area(area.id).then(
        (d) => setResults((r) => ({ ...r, [area.id]: { rows: d.items.filter((row) => row.supportUntil && String(row.supportUntil) < cutoff) } })),
        (e: unknown) => setResults((r) => ({ ...r, [area.id]: { error: e instanceof Error ? e.message : String(e) } })),
      );
    }
  }, [areas, cutoff]);

  const customers = useMemo(() => {
    const map = new Map<string, CustomerSummary>();
    for (const r of Object.values(results)) {
      if (!("rows" in r)) continue;
      for (const row of r.rows) {
        const name = String(row.company ?? "").trim();
        if (!name) continue;
        const c = map.get(name) ?? { name, count: 0, eol: 0, open: 0 };
        c.count++;
        if (isEol(row)) c.eol++;
        if (row.status !== "Abgeschlossen") c.open++;
        map.set(name, c);
      }
    }
    return [...map.values()];
  }, [results]);

  const saved = (areaId: string, row: AreaRow) =>
    setResults((r) => {
      const current = r[areaId];
      return "rows" in current ? { ...r, [areaId]: { rows: current.rows.map((x) => (x.id === row.id ? row : x)) } } : r;
    });

  const toggle = (id: string) =>
    setHidden((h) => {
      const next = new Set(h);
      if (!next.delete(id)) next.add(id);
      return next;
    });
  const allHidden = areas.every((a) => hidden.has(a.id));
  const ofCustomer = (rows: AreaRow[]) => (customer ? rows.filter((row) => String(row.company ?? "").trim() === customer) : rows);

  return (
    <div className="flex w-full flex-col gap-4">
      <div>
        <h1 className="text-2xl font-semibold">Auslaufende Kundensysteme</h1>
        <p className="text-sm text-muted-foreground">
          Support bis spätestens {lastDay(cutoff)} oder bereits abgelaufen · rot: EOL = Ja
        </p>
      </div>

      <DataTable
        compact
        title="Übersicht Kunden"
        columns={[
          { key: "name", label: "Firma", value: (c) => c.name },
          { key: "count", label: "Systeme", value: (c) => String(c.count), sortValue: (c) => String(c.count).padStart(5, "0"), width: 100, className: "tabular-nums" },
          { key: "open", label: "Nicht abgeschlossen", value: (c) => String(c.open), sortValue: (c) => String(c.open).padStart(5, "0"), width: 170, className: "tabular-nums" },
          { key: "eol", label: "davon EOL", value: (c) => String(c.eol), sortValue: (c) => String(c.eol).padStart(5, "0"), width: 110, className: "tabular-nums" },
        ]}
        rows={customers}
        rowKey={(c) => c.name}
        exportName="auslaufend-kunden"
        emptyText={Object.keys(results).length < areas.length ? "Wird geladen …" : "Keine auslaufenden Systeme."}
        onOpen={(c) => setCustomer(c.name)}
      />

      <div className="flex flex-wrap items-center gap-2" role="group" aria-label="Bereiche ein- und ausblenden">
        {customer && (
          <span className="inline-flex h-9 items-center gap-1 rounded-md border border-brand bg-brand/10 pr-1 pl-3 text-sm font-medium text-brand" data-testid="customer-filter">
            Kunde: {customer}
            <button type="button" onClick={() => setCustomer(null)} aria-label="Alle Kunden anzeigen" className="rounded p-1 hover:bg-brand/15">
              <X className="size-4" aria-hidden />
            </button>
          </span>
        )}
        <button
          type="button"
          onClick={() => setHidden(allHidden ? new Set() : new Set(areas.map((a) => a.id)))}
          className="inline-flex h-9 items-center gap-2 rounded-md border bg-card px-3 text-sm font-medium shadow-xs transition-colors duration-150 hover:border-brand hover:text-brand"
        >
          {allHidden ? <Eye className="size-4" aria-hidden /> : <EyeOff className="size-4" aria-hidden />}
          {allHidden ? "Alles einblenden" : "Alles ausblenden"}
        </button>
        {areas.map((a) => {
          const r = results[a.id];
          const shown = !hidden.has(a.id);
          return (
            <button
              key={a.id}
              type="button"
              aria-pressed={shown}
              onClick={() => toggle(a.id)}
              className={cn(
                "inline-flex h-9 items-center gap-2 rounded-md border px-3 text-sm font-medium shadow-xs transition-colors duration-150",
                shown ? "border-brand bg-brand text-brand-foreground hover:bg-brand-hover" : "bg-card text-muted-foreground hover:border-brand hover:text-brand",
              )}
            >
              {areaName(a)}
              <span className={cn("rounded px-1.5 text-xs tabular-nums", shown ? "bg-white/20" : "bg-muted")}>{r && "rows" in r ? ofCustomer(r.rows).length : "…"}</span>
            </button>
          );
        })}
      </div>

      {areas
        .filter((a) => !hidden.has(a.id))
        .map((a) => {
          const r = results[a.id];
          const name = areaName(a);
          if (!r) return <p key={a.id} className="text-sm text-muted-foreground">{name} wird geladen …</p>;
          if ("error" in r) return <p key={a.id} role="alert" className="text-sm text-destructive">{name}: {r.error}</p>;
          return (
            <DataTable
              key={`${a.id}:${customer ?? ""}`}
              compact
              title={customer ? `${name} | ${customer}` : name}
              columns={areaColumns(a, { include: ["status", "supportUntil", "eol"] })}
              rows={ofCustomer(r.rows)}
              rowKey={(row) => row.id}
              exportName={`auslaufend-${a.id}`}
              emptyText="Keine auslaufenden Systeme."
              defaultSort={{ key: "company", desc: false }}
              highlight={isEol}
              selectedActions={can(a.id, "edit") ? (row) => <StatusPicker area={a} row={row} onSaved={(next) => saved(a.id, next)} /> : undefined}
              onOpen={(row) =>
                navigate(`/bereich/${a.id}/${row.id}`, { viewTransition: true, state: { back: { to: "/auflistungen/auslaufend", label: "Zurück zu Auslaufende Kundensysteme" } } })
              }
            />
          );
        })}
    </div>
  );
}
