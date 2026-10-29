import { useEffect, useMemo, useState } from "react";
import { Eye, EyeOff } from "lucide-react";
import { useNavigate } from "react-router";
import { DataTable } from "@/components/DataTable";
import { api } from "@/lib/api";
import { AREAS, type AreaRow } from "@/lib/areas";
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

type Result = { rows: AreaRow[] } | { error: string };

/** Auslaufende Kundensysteme je Bereich; EOL = Ja rot. Knöpfe oben blenden Bereiche aus und ein. */
export function ExpiringPage() {
  const navigate = useNavigate();
  const { can } = useAuth();
  const areas = useMemo(() => EXPIRING_AREAS.filter((id) => can(id, "read")).map((id) => AREAS[id]), [can]);
  const [results, setResults] = useState<Record<string, Result>>({});
  const [hidden, setHidden] = useState<Set<string>>(new Set());
  const cutoff = expiringBefore();

  useEffect(() => {
    for (const area of areas) {
      api.area(area.id).then(
        (d) => setResults((r) => ({ ...r, [area.id]: { rows: d.items.filter((row) => row.supportUntil && String(row.supportUntil) < cutoff) } })),
        (e: unknown) => setResults((r) => ({ ...r, [area.id]: { error: e instanceof Error ? e.message : String(e) } })),
      );
    }
  }, [areas, cutoff]);

  const toggle = (id: string) =>
    setHidden((h) => {
      const next = new Set(h);
      if (!next.delete(id)) next.add(id);
      return next;
    });
  const allHidden = areas.every((a) => hidden.has(a.id));

  return (
    <div className="flex w-full flex-col gap-4">
      <div>
        <h1 className="text-2xl font-semibold">Auslaufende Kundensysteme</h1>
        <p className="text-sm text-muted-foreground">
          Support bis spätestens {lastDay(cutoff)} oder bereits abgelaufen · rot: EOL = Ja
        </p>
      </div>
      <div className="flex flex-wrap gap-2" role="group" aria-label="Bereiche ein- und ausblenden">
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
              {a.plural ?? a.title.replace(/^Übersicht /, "")}
              <span className={cn("rounded px-1.5 text-xs tabular-nums", shown ? "bg-white/20" : "bg-muted")}>{r && "rows" in r ? r.rows.length : "…"}</span>
            </button>
          );
        })}
      </div>
      {areas
        .filter((a) => !hidden.has(a.id))
        .map((a) => {
          const r = results[a.id];
          const name = a.plural ?? a.title.replace(/^Übersicht /, "");
          if (!r) return <p key={a.id} className="text-sm text-muted-foreground">{name} wird geladen …</p>;
          if ("error" in r) return <p key={a.id} role="alert" className="text-sm text-destructive">{name}: {r.error}</p>;
          return (
            <DataTable
              key={a.id}
              compact
              title={name}
              columns={areaColumns(a, { include: ["supportUntil", "eol"] })}
              rows={r.rows}
              rowKey={(row) => row.id}
              exportName={`auslaufend-${a.id}`}
              emptyText="Keine auslaufenden Systeme."
              defaultSort={{ key: "company", desc: false }}
              highlight={(row) => String(row.eol ?? "").toLowerCase() === "ja"}
              onOpen={(row) =>
                navigate(`/bereich/${a.id}/${row.id}`, { viewTransition: true, state: { back: { to: "/auflistungen/auslaufend", label: "Zurück zu Auslaufende Kundensysteme" } } })
              }
            />
          );
        })}
    </div>
  );
}
