import { useEffect, useMemo, useState } from "react";
import { ArrowLeft, CheckCircle2, Plus } from "lucide-react";
import { Link, useLocation, useNavigate, useParams } from "react-router";
import { DataTable, type Column } from "@/components/DataTable";
import { Button } from "@/components/ui/button";
import { api } from "@/lib/api";
import { AREAS, type Area, type AreaListResponse, type AreaRow } from "@/lib/areas";
import { longDate, shortDate } from "@/lib/format";
import { useAuth } from "@/state/auth";
import { NotFoundPage } from "./NotFoundPage";

function errorText(e: unknown): string {
  return e instanceof Error ? e.message : String(e);
}

/** Spalten der Übersicht eines Bereichs; in der Kundenansicht ohne Firma (steht schon oben) */
export function areaColumns(area: Area, options: { withoutCompany?: boolean } = {}): Column<AreaRow>[] {
  return [
    { key: "id", label: "ID", value: (r) => String(r.id), width: 80, className: "tabular-nums" },
    ...area.fields
      .filter((f) => !f.detailOnly && !(options.withoutCompany && f.key === "company"))
      .map((f): Column<AreaRow> => ({
        key: f.key,
        label: f.label,
        width: f.width,
        value: (r) => (f.date ? shortDate(String(r[f.key] || "")) : String(r[f.key] ?? "")),
        ...(f.date ? { sortValue: (r: AreaRow) => String(r[f.key] ?? ""), className: "tabular-nums" } : {}),
      })),
  ];
}

/** Übersicht eines Bereichs (z. B. Hardware › Server), nur lesend */
export function AreaPage({ area }: { area: Area }) {
  const navigate = useNavigate();
  const { user } = useAuth();
  const [data, setData] = useState<AreaListResponse | null>(null);
  const [error, setError] = useState("");

  useEffect(() => {
    setData(null);
    setError("");
    api.area(area.id).then(setData, (e: unknown) => setError(errorText(e)));
  }, [area.id]);

  const columns = useMemo(() => areaColumns(area), [area]);

  return (
    <div className="flex min-h-0 flex-1 flex-col gap-3">
      {error && <p role="alert" className="rounded-md border border-destructive/30 bg-destructive/10 px-4 py-3 text-sm text-destructive">{error}</p>}
      {!data && !error && <p className="text-sm text-muted-foreground">Wird geladen …</p>}
      {data && (
        <DataTable
          key={area.id}
          title={area.title}
          columns={columns}
          rows={data.items}
          rowKey={(r) => r.id}
          exportName={area.id}
          emptyText="Keine Einträge gefunden."
          onOpen={(r) => navigate(`/bereich/${area.id}/${r.id}`, { viewTransition: true })}
          actions={
            user?.role === "admin" && area.createFields ? (
              <Button size="sm" variant="outline" asChild>
                <Link to={`/bereich/${area.id}/neu`} viewTransition>
                  <Plus aria-hidden />
                  Anlegen
                </Link>
              </Button>
            ) : undefined
          }
        />
      )}
      {data?.source === "test" && <p className="shrink-0 text-xs text-muted-foreground">Alle Einträge sind erfunden.</p>}
    </div>
  );
}

/** Ein Eintrag eines Bereichs mit allen Feldern, nur lesend (Bearbeiten kommt mit Phase 2) */
export function AreaDetailPage() {
  const { id = "", itemId = "" } = useParams();
  // Woher der Eintrag geöffnet wurde (z. B. aus der Kundenansicht); „Zurück“ führt dorthin
  const state = useLocation().state as { created?: boolean; back?: { to: string; label: string } } | null;
  const created = state?.created;
  const area = Object.hasOwn(AREAS, id) ? AREAS[id] : undefined;
  const [row, setRow] = useState<AreaRow | null>(null);
  const [error, setError] = useState("");

  useEffect(() => {
    if (area) api.areaRow(area.id, Number(itemId)).then(setRow, (e: unknown) => setError(errorText(e)));
  }, [area, itemId]);

  if (!area) return <NotFoundPage />;
  const tag = row && (row.serviceTag || row.serialNumber);

  return (
    <div className="flex w-full flex-col gap-3">
      <Button variant="outline" size="sm" className="self-start" asChild>
        <Link to={state?.back?.to ?? `/bereich/${area.id}`} viewTransition>
          <ArrowLeft aria-hidden />
          {state?.back?.label ?? `Zurück zur ${area.title}`}
        </Link>
      </Button>
      {error && <p role="alert" className="text-sm text-destructive">{error}</p>}
      {row && created && (
        <p role="status" className="flex items-center gap-2 rounded-md border border-success/30 bg-success/10 px-4 py-3 text-sm text-success">
          <CheckCircle2 className="size-4" aria-hidden />
          {area.singular} {row.id} wurde angelegt.
        </p>
      )}
      {row && (
        <section className="animate-appear overflow-hidden rounded-lg border bg-card shadow-xs" aria-label={`${area.singular} ${row.id}`}>
          <h1 className="bg-brand px-4 py-2.5 text-lg font-medium text-brand-foreground">
            {area.singular} {row.id}
            {tag ? ` · ${tag}` : ""}
          </h1>
          <dl className="grid gap-x-6 gap-y-3 p-4 text-sm sm:grid-cols-[10rem_1fr] xl:grid-cols-[10rem_1fr_10rem_1fr]">
            <div className="contents">
              <dt className="text-muted-foreground">ID</dt>
              <dd className="tabular-nums">{row.id}</dd>
            </div>
            {area.fields.map((f) => {
              const value = String(row[f.key] ?? "");
              return (
                <div key={f.key} className="contents">
                  <dt className="text-muted-foreground">{f.label}</dt>
                  <dd className="min-h-5 break-words">{(f.date ? longDate(value) : value) || "–"}</dd>
                </div>
              );
            })}
          </dl>
          <p className="border-t px-4 py-2 text-xs text-muted-foreground">Nur lesend. Ändern ist weiterhin in GAPTEQ möglich.</p>
        </section>
      )}
    </div>
  );
}
