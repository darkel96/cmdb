import { useEffect, useRef, useState } from "react";
import { Download, FileText, Upload } from "lucide-react";
import { Button } from "@/components/ui/button";
import { api, MAX_DOCUMENT_MB } from "@/lib/api";
import type { Area, CustomerDocument } from "@/lib/areas";
import { useAuth } from "@/state/auth";

/**
 * Dokumente eines Systems (Lieferschein, Lizenzzertifikat, Wartungsvertrag …) wie in GAPTEQ: dbo.Anhang mit
 * Vertrag_ID = ID. Hochladen mit dem Recht Bearbeiten; die Dateien erscheinen auch beim Kunden.
 */
export function SystemDocuments({ area, id }: { area: Area; id: number }) {
  const { can } = useAuth();
  const input = useRef<HTMLInputElement>(null);
  const [documents, setDocuments] = useState<CustomerDocument[] | null>(null);
  const [error, setError] = useState("");
  const [upload, setUpload] = useState<{ busy?: boolean; error?: string; done?: string }>({});

  useEffect(() => {
    setDocuments(null);
    api.systemDocuments(area.id, id).then((r) => setDocuments(r.documents), (e: unknown) => setError(e instanceof Error ? e.message : String(e)));
  }, [area.id, id]);

  async function uploadFiles(files: FileList | null) {
    if (!files?.length) return;
    const tooBig = [...files].find((f) => f.size > MAX_DOCUMENT_MB * 1024 * 1024);
    if (tooBig) return setUpload({ error: `„${tooBig.name}“ ist zu gross (höchstens ${MAX_DOCUMENT_MB} MB).` });
    setUpload({ busy: true });
    try {
      for (const f of files) await api.uploadSystemDocument(area.id, id, f);
      setDocuments((await api.systemDocuments(area.id, id)).documents);
      setUpload({ done: files.length === 1 ? `„${files[0].name}“ wurde gespeichert.` : `${files.length} Dateien wurden gespeichert.` });
    } catch (e) {
      setUpload({ error: e instanceof Error ? e.message : String(e) });
    } finally {
      if (input.current) input.current.value = "";
    }
  }

  return (
    <section className="animate-appear overflow-hidden rounded-lg border bg-card shadow-xs" aria-label="Dokumente">
      <div className="flex items-center justify-between gap-2 bg-brand px-4 py-2.5 text-brand-foreground">
        <h2 className="text-lg font-medium">Dokumente</h2>
        {can(area.id, "edit") && (
          <>
            <input ref={input} type="file" multiple hidden aria-label="Dateien auswählen" onChange={(e) => void uploadFiles(e.target.files)} />
            <Button
              size="sm"
              variant="outline"
              className="h-7 border-white/40 bg-white/15 text-brand-foreground hover:bg-white/25 hover:text-brand-foreground"
              disabled={upload.busy}
              onClick={() => input.current?.click()}
              title={`Datei an ${area.singular} ${id} hängen (höchstens ${MAX_DOCUMENT_MB} MB)`}
            >
              <Upload aria-hidden />
              {upload.busy ? "Wird hochgeladen …" : "Hochladen"}
            </Button>
          </>
        )}
      </div>
      <div className="p-4">
        {upload.error && <p role="alert" className="mb-2 text-sm text-destructive">{upload.error}</p>}
        {upload.done && <p role="status" className="mb-2 text-sm text-success">{upload.done}</p>}
        {error ? (
          <p className="text-sm text-muted-foreground">{error}</p>
        ) : !documents ? (
          <p className="text-sm text-muted-foreground">Wird geladen …</p>
        ) : documents.length === 0 ? (
          <p className="text-sm text-muted-foreground">Keine Dateien</p>
        ) : (
          <ul className="flex flex-col gap-1.5 text-sm">
            {documents.map((d) => {
              const url = api.systemDocumentUrl(area.id, id, d.id);
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
                </li>
              );
            })}
          </ul>
        )}
      </div>
    </section>
  );
}
