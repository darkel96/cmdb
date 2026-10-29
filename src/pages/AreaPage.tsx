import { useEffect, useMemo, useState } from "react";
import { ArrowLeft, CheckCircle2, Pencil, Plus, Trash2 } from "lucide-react";
import { Link, useLocation, useNavigate, useParams, useSearchParams } from "react-router";
import { DataTable, type Column } from "@/components/DataTable";
import { SecretValue } from "@/components/SecretValue";
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
export function areaColumns(area: Area, options: { withoutCompany?: boolean; include?: string[] } = {}): Column<AreaRow>[] {
  return [
    { key: "id", label: "ID", value: (r) => String(r.id), width: 80, className: "tabular-nums" },
    ...area.fields
      .filter((f) => (!f.detailOnly || options.include?.includes(f.key)) && !(options.withoutCompany && f.key === "company"))
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
  // Filter aus der Adresse, z. B. ?filter.dbVersion=19.11.0.0 aus einer Auflistung
  const [params] = useSearchParams();
  const initialFilters = useMemo(
    () => Object.fromEntries([...params].filter(([k]) => k.startsWith("filter.")).map(([k, v]) => [k.slice(7), v])),
    [params],
  );
  const { can } = useAuth();
  const [data, setData] = useState<AreaListResponse | null>(null);
  const [error, setError] = useState("");
  // Nach dem Löschen aus der Detailansicht
  const deleted = (useLocation().state as { deleted?: string } | null)?.deleted;

  useEffect(() => {
    setData(null);
    setError("");
    api.area(area.id).then(setData, (e: unknown) => setError(errorText(e)));
  }, [area.id]);

  const columns = useMemo(() => areaColumns(area), [area]);

  return (
    <div className="flex min-h-0 flex-1 flex-col gap-3">
      {deleted && (
        <p role="status" className="flex shrink-0 items-center gap-2 rounded-md border border-success/30 bg-success/10 px-4 py-3 text-sm text-success">
          <CheckCircle2 className="size-4" aria-hidden />
          {deleted} wurde gelöscht.
        </p>
      )}
      {error && <p role="alert" className="rounded-md border border-destructive/30 bg-destructive/10 px-4 py-3 text-sm text-destructive">{error}</p>}
      {!data && !error && <p className="text-sm text-muted-foreground">Wird geladen …</p>}
      {data && (
        <DataTable
          key={`${area.id}?${params}`}
          title={area.title}
          initialFilters={initialFilters}
          columns={columns}
          rows={data.items}
          rowKey={(r) => r.id}
          exportName={area.id}
          emptyText="Keine Einträge gefunden."
          onOpen={(r) => navigate(`/bereich/${area.id}/${r.id}`, { viewTransition: true })}
          actions={
            area.createFields && can(area.id, "create") ? (
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
  const state = useLocation().state as { created?: boolean; saved?: boolean; changed?: string[]; back?: { to: string; label: string } } | null;
  const { can } = useAuth();
  const created = state?.created;
  const area = Object.hasOwn(AREAS, id) ? AREAS[id] : undefined;
  const [row, setRow] = useState<AreaRow | null>(null);
  const [error, setError] = useState("");
  const navigate = useNavigate();
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [deleting, setDeleting] = useState(false);

  async function remove() {
    if (!area || !row) return;
    setDeleting(true);
    setError("");
    try {
      // Werte beim Öffnen: hat sich inzwischen etwas geändert, löscht der Dienst nicht
      await api.deleteAreaRow(area.id, row.id, Object.fromEntries(area.fields.map((f) => [f.key, String(row[f.key] ?? "")])));
      navigate(state?.back?.to ?? `/bereich/${area.id}`, { viewTransition: true, state: { deleted: `${area.singular} ${row.id}` } });
    } catch (e) {
      setError(errorText(e));
      setConfirmDelete(false);
    } finally {
      setDeleting(false);
    }
  }

  useEffect(() => {
    if (area) api.areaRow(area.id, Number(itemId)).then(setRow, (e: unknown) => setError(errorText(e)));
  }, [area, itemId]);

  if (!area) return <NotFoundPage />;
  const tag = row && (row.serviceTag || row.serialNumber);

  return (
    <div className="flex w-full flex-col gap-3">
      <div className="flex items-center justify-between gap-2">
      <Button variant="outline" size="sm" asChild>
        <Link to={state?.back?.to ?? `/bereich/${area.id}`} viewTransition>
          <ArrowLeft aria-hidden />
          {state?.back?.label ?? `Zurück zur ${area.title}`}
        </Link>
      </Button>
      <div className="flex flex-wrap items-center justify-end gap-2">
        {row && area.createFields && can(area.id, "delete") && !confirmDelete && (
          <Button size="sm" variant="outline" className="text-destructive hover:text-destructive" onClick={() => setConfirmDelete(true)}>
            <Trash2 aria-hidden />
            Löschen
          </Button>
        )}
        {confirmDelete && (
          <span role="alertdialog" aria-label="Löschen bestätigen" className="flex flex-wrap items-center gap-2 rounded-md border border-destructive/30 bg-destructive/10 px-3 py-1 text-sm text-destructive">
            {area.singular} {row?.id} wirklich löschen?
            <Button size="sm" className="bg-destructive text-white hover:bg-destructive/90" onClick={() => void remove()} disabled={deleting}>
              {deleting ? "Wird gelöscht …" : "Ja, löschen"}
            </Button>
            <Button size="sm" variant="ghost" onClick={() => setConfirmDelete(false)} disabled={deleting}>
              Abbrechen
            </Button>
          </span>
        )}
        {row && area.createFields && can(area.id, "edit") && (
          <Button size="sm" asChild>
            <Link to={`/bereich/${area.id}/${row.id}/bearbeiten`} viewTransition state={{ back: state?.back }}>
              <Pencil aria-hidden />
              Bearbeiten
            </Link>
          </Button>
        )}
      </div>
      </div>
      {error && <p role="alert" className="text-sm text-destructive">{error}</p>}
      {row && state?.saved && (
        <p role="status" className="flex items-center gap-2 rounded-md border border-success/30 bg-success/10 px-4 py-3 text-sm text-success">
          <CheckCircle2 className="size-4" aria-hidden />
          {state.changed?.length ? `${area.singular} ${row.id} wurde gespeichert (geändert: ${state.changed.join(", ")}).` : `${area.singular} ${row.id}: keine Änderung.`}
        </p>
      )}
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
            {area.secret && (
              <div className="contents">
                <dt className="text-muted-foreground">{area.secret.label}</dt>
                <dd className="min-h-5">
                  <SecretValue areaId={area.id} id={row.id} label={area.secret.label} allowed={can(area.id, "edit")} />
                </dd>
              </div>
            )}
          </dl>
          <p className="border-t px-4 py-2 text-xs text-muted-foreground">
            {area.createFields && can(area.id, "edit") ? "Ändern über „Bearbeiten“ oder weiterhin in GAPTEQ." : "Nur lesend."}
          </p>
        </section>
      )}
    </div>
  );
}
