import { useEffect, useState } from "react";
import { ArrowLeft, CheckCircle2, Download, FileText, Pencil } from "lucide-react";
import { Link, useLocation, useNavigate, useParams } from "react-router";
import { useAuth } from "@/state/auth";
import { DataTable } from "@/components/DataTable";
import { Button } from "@/components/ui/button";
import { api } from "@/lib/api";
import { AREAS, type CustomerDetailResponse } from "@/lib/areas";
import { areaColumns } from "./AreaPage";

function Box({ title, children, className }: { title: string; children: React.ReactNode; className?: string }) {
  return (
    <section className={`animate-appear overflow-hidden rounded-lg border bg-card shadow-xs ${className ?? ""}`} aria-label={title}>
      <h2 className="bg-brand px-4 py-2.5 text-lg font-medium text-brand-foreground">{title}</h2>
      <div className="p-4">{children}</div>
    </section>
  );
}

/** Kundenansicht: Kundeninformation, Dokumente und alle angelegten Systeme des Kunden je Bereich (wie in GAPTEQ) */
export function CustomerPage() {
  const { customerId = "" } = useParams();
  const navigate = useNavigate();
  const { can } = useAuth();
  const state = useLocation().state as { created?: boolean; saved?: boolean; renamed?: { label: string; count: number }[] } | null;
  const [data, setData] = useState<CustomerDetailResponse | null>(null);
  const [error, setError] = useState("");

  useEffect(() => {
    setData(null);
    setError("");
    api.customer(Number(customerId)).then(setData, (e: unknown) => setError(e instanceof Error ? e.message : String(e)));
  }, [customerId]);

  const areas = data ? Object.values(AREAS).filter((a) => data.systems[a.id]?.length) : [];
  const errors = data ? Object.entries(data.errors) : [];

  return (
    <div className="flex w-full flex-col gap-4">
      <div className="flex items-center justify-between gap-2">
        <Button variant="outline" size="sm" asChild>
          <Link to="/" viewTransition>
            <ArrowLeft aria-hidden />
            Zur Kundenübersicht
          </Link>
        </Button>
        {(can("kunden", "edit") || can("kunden", "delete")) && (
          <Button variant="outline" size="sm" asChild>
            <Link to={`/kunden/${customerId}/bearbeiten`} viewTransition>
              <Pencil aria-hidden />
              Bearbeiten
            </Link>
          </Button>
        )}
      </div>
      {data && (state?.created || state?.saved) && (
        <p role="status" className="flex items-center gap-2 rounded-md border border-success/30 bg-success/10 px-4 py-3 text-sm text-success">
          <CheckCircle2 className="size-4 shrink-0" aria-hidden />
          {state.created ? "Kunde wurde angelegt." : "Kunde wurde gespeichert."}
          {state.renamed?.length ? ` Mitumbenannt: ${state.renamed.map((r) => `${r.label} (${r.count})`).join(", ")}.` : ""}
        </p>
      )}
      {error && <p role="alert" className="rounded-md border border-destructive/30 bg-destructive/10 px-4 py-3 text-sm text-destructive">{error}</p>}
      {!data && !error && <p className="text-sm text-muted-foreground">Wird geladen …</p>}
      {data && (
        <>
          <div className="grid gap-4 lg:grid-cols-2">
            <Box title="Kundeninformation">
              <dl className="grid grid-cols-[6rem_1fr] gap-x-4 gap-y-2 text-sm">
                <dt className="text-muted-foreground">Kunde</dt>
                <dd data-testid="customer-name">{data.customer.name}</dd>
                <dt className="text-muted-foreground">Land</dt>
                <dd>{data.customer.country || "–"}</dd>
                <dt className="text-muted-foreground">Stadt</dt>
                <dd>{data.customer.city || "–"}</dd>
              </dl>
            </Box>
            <Box title="Dokumente">
              {data.documentsError ? (
                <p className="text-sm text-muted-foreground">{data.documentsError}</p>
              ) : data.documents.length === 0 ? (
                <p className="text-sm text-muted-foreground">Keine Dateien</p>
              ) : (
                <ul className="flex flex-col gap-1.5 text-sm">
                  {data.documents.map((d) => {
                    const url = api.documentUrl(data.customer.id, d.id);
                    return (
                      <li key={d.id} className="flex items-center gap-2">
                        <FileText className="size-4 shrink-0 text-muted-foreground" aria-hidden />
                        {url ? (
                          <a href={url} download className="inline-flex items-center gap-1.5 text-brand underline-offset-4 hover:underline">
                            {d.name}
                            <Download className="size-3.5" aria-hidden />
                          </a>
                        ) : (
                          <span>{d.name}</span>
                        )}
                        {d.type && <span className="text-xs text-muted-foreground">{d.type}</span>}
                      </li>
                    );
                  })}
                </ul>
              )}
            </Box>
          </div>
          {areas.map((area) => (
            <DataTable
              key={area.id}
              compact
              title={`Übersicht ${area.plural ?? area.singular}`}
              columns={areaColumns(area, { withoutCompany: true })}
              rows={data.systems[area.id]}
              rowKey={(r) => r.id}
              exportName={`${area.id}-${data.customer.name}`}
              onOpen={(r) =>
                navigate(`/bereich/${area.id}/${r.id}`, { viewTransition: true, state: { back: { to: `/kunden/${data.customer.id}`, label: `Zurück zu ${data.customer.name}` } } })
              }
            />
          ))}
          {areas.length === 0 && <p className="text-sm text-muted-foreground">Für diesen Kunden sind keine Systeme angelegt.</p>}
          {errors.length > 0 && (
            <p className="text-xs text-muted-foreground">
              Nicht angezeigt: {errors.map(([id, message]) => `${AREAS[id]?.plural ?? AREAS[id]?.singular ?? id} (${message})`).join(" · ")}
            </p>
          )}
          {data.source === "test" && <p className="text-xs text-muted-foreground">Alle Daten sind erfunden.</p>}
        </>
      )}
    </div>
  );
}
