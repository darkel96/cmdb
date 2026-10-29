import { useEffect, useRef, useState } from "react";
import { ArrowLeft, CheckCircle2, Download, FileText, Pencil, Upload } from "lucide-react";
import { Link, useLocation, useNavigate, useParams } from "react-router";
import { useAuth } from "@/state/auth";
import { DataTable } from "@/components/DataTable";
import { Button } from "@/components/ui/button";
import { api, MAX_DOCUMENT_MB } from "@/lib/api";
import { AREAS, type CustomerDetailResponse } from "@/lib/areas";
import { areaColumns } from "./AreaPage";

function Box({ title, children, className, action }: { title: string; children: React.ReactNode; className?: string; action?: React.ReactNode }) {
  return (
    <section className={`animate-appear overflow-hidden rounded-lg border bg-card shadow-xs ${className ?? ""}`} aria-label={title}>
      <div className="flex items-center justify-between gap-2 bg-brand px-4 py-2.5 text-brand-foreground">
        <h2 className="text-lg font-medium">{title}</h2>
        {action}
      </div>
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

  const fileInput = useRef<HTMLInputElement>(null);
  const [upload, setUpload] = useState<{ busy?: boolean; error?: string; done?: string }>({});

  useEffect(() => {
    setData(null);
    setError("");
    setUpload({});
    api.customer(Number(customerId)).then(setData, (e: unknown) => setError(e instanceof Error ? e.message : String(e)));
  }, [customerId]);

  async function uploadFiles(files: FileList | null) {
    if (!files?.length) return;
    const tooBig = [...files].find((f) => f.size > MAX_DOCUMENT_MB * 1024 * 1024);
    if (tooBig) return setUpload({ error: `„${tooBig.name}“ ist zu gross (höchstens ${MAX_DOCUMENT_MB} MB).` });
    setUpload({ busy: true });
    try {
      for (const f of files) await api.uploadDocument(Number(customerId), f);
      setData(await api.customer(Number(customerId)));
      setUpload({ done: files.length === 1 ? `„${files[0].name}“ wurde gespeichert.` : `${files.length} Dateien wurden gespeichert.` });
    } catch (e) {
      setUpload({ error: e instanceof Error ? e.message : String(e) });
    } finally {
      if (fileInput.current) fileInput.current.value = "";
    }
  }

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
            <Box
              title="Dokumente"
              action={
                can("kunden", "edit") && (
                  <>
                    <input ref={fileInput} type="file" multiple hidden aria-label="Dateien auswählen" onChange={(e) => void uploadFiles(e.target.files)} />
                    <Button
                      size="sm"
                      variant="outline"
                      className="h-7 border-white/40 bg-white/15 text-brand-foreground hover:bg-white/25 hover:text-brand-foreground"
                      disabled={upload.busy}
                      onClick={() => fileInput.current?.click()}
                      title={`Datei direkt beim Kunden speichern (höchstens ${MAX_DOCUMENT_MB} MB)`}
                    >
                      <Upload aria-hidden />
                      {upload.busy ? "Wird hochgeladen …" : "Hochladen"}
                    </Button>
                  </>
                )
              }
            >
              {upload.error && <p role="alert" className="mb-2 text-sm text-destructive">{upload.error}</p>}
              {upload.done && <p role="status" className="mb-2 text-sm text-success">{upload.done}</p>}
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
