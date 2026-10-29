import { useEffect, useState } from "react";
import { ChevronDown, History } from "lucide-react";
import { api } from "@/lib/api";
import type { HistoryAction, HistoryResponse } from "@/lib/history";
import { cn } from "@/lib/utils";

const ACTION_LABEL: Record<HistoryAction, string> = { angelegt: "Angelegt", geändert: "Geändert", gelöscht: "Gelöscht", status: "Status", dokument: "Dokument" };
const ACTION_TONE: Record<HistoryAction, string> = {
  angelegt: "bg-success/10 text-success",
  geändert: "bg-brand/10 text-brand",
  gelöscht: "bg-destructive/10 text-destructive",
  status: "bg-muted text-foreground",
  dokument: "bg-muted text-foreground",
};

/** Werte lesbar: Datum als TT.MM.JJJJ, leer als „–“ */
const show = (v?: string) => (!v ? "–" : /^\d{4}-\d{2}-\d{2}$/.test(v) ? `${v.slice(8, 10)}.${v.slice(5, 7)}.${v.slice(0, 4)}` : v);

/**
 * Änderungsverlauf eines Eintrags (System oder Kunde): wer hat wann was geändert, neueste oben. Zuerst die letzten
 * fünf, „Alle anzeigen“ zeigt den Rest. Passwörter nur als „geändert“. Änderungen in GAPTEQ erscheinen hier nicht.
 */
export function HistoryPanel({ area, id, refresh = 0 }: { area: string; id: number; refresh?: number }) {
  const [data, setData] = useState<HistoryResponse | null>(null);
  const [error, setError] = useState("");
  const [all, setAll] = useState(false);

  useEffect(() => {
    api.history(area, id).then(setData, (e: unknown) => setError(e instanceof Error ? e.message : String(e)));
  }, [area, id, refresh]);

  const items = data?.items ?? [];
  const shown = all ? items : items.slice(0, 5);

  return (
    <section className="animate-appear overflow-hidden rounded-lg border bg-card shadow-xs" aria-label="Änderungsverlauf">
      <div className="flex items-center gap-2 border-b px-4 py-3">
        <History className="size-4 text-muted-foreground" aria-hidden />
        <h2 className="font-semibold">Änderungsverlauf</h2>
        {items.length > 0 && <span className="text-xs text-muted-foreground">{items.length} Einträge</span>}
        <span className="ml-auto text-xs text-muted-foreground">Änderungen in GAPTEQ erscheinen hier nicht</span>
      </div>
      {error && <p role="alert" className="px-4 py-3 text-sm text-destructive">{error}</p>}
      {!data && !error && <p className="px-4 py-3 text-sm text-muted-foreground">Wird geladen …</p>}
      {data && !data.available && <p className="px-4 py-3 text-sm text-muted-foreground">Der Verlauf ist hier nicht verfügbar.</p>}
      {data?.available && items.length === 0 && <p className="px-4 py-3 text-sm text-muted-foreground">Noch keine Änderungen über die CMDB.</p>}
      {shown.length > 0 && (
        <ol className="divide-y text-sm" aria-label="Einträge im Verlauf">
          {shown.map((h) => (
            <li key={h.id} className="flex flex-col gap-1 px-4 py-2.5 sm:flex-row sm:gap-4">
              <div className="flex shrink-0 items-start gap-2 sm:w-64">
                <span className={cn("rounded px-1.5 py-0.5 text-xs font-medium", ACTION_TONE[h.action])}>{ACTION_LABEL[h.action]}</span>
                <span className="flex flex-col">
                  <span className="tabular-nums">{new Date(h.at).toLocaleString("de-DE", { dateStyle: "medium", timeStyle: "short" })}</span>
                  <span className="text-xs text-muted-foreground">{h.username}</span>
                </span>
              </div>
              <ul className="flex min-w-0 flex-1 flex-col gap-0.5">
                {h.changes.map((c, i) => (
                  <li key={i} className="break-words">
                    <span className="text-muted-foreground">{c.label}: </span>
                    {c.secret ? (
                      <span className="italic">{c.new === "entfernt" ? "entfernt" : "geändert"}</span>
                    ) : h.action === "angelegt" || h.action === "dokument" ? (
                      <span>{show(c.new)}</span>
                    ) : h.action === "gelöscht" ? (
                      <span className="line-through decoration-muted-foreground/60">{show(c.old)}</span>
                    ) : (
                      <>
                        <span className="text-muted-foreground line-through decoration-muted-foreground/60">{show(c.old)}</span>
                        <span className="text-muted-foreground"> → </span>
                        <span className="font-medium">{show(c.new)}</span>
                      </>
                    )}
                  </li>
                ))}
                {h.changes.length === 0 && <li className="text-muted-foreground">–</li>}
              </ul>
            </li>
          ))}
        </ol>
      )}
      {items.length > 5 && (
        <button type="button" onClick={() => setAll((a) => !a)} className="flex w-full items-center justify-center gap-1 border-t px-4 py-2 text-xs text-brand hover:bg-accent">
          {all ? "Weniger anzeigen" : `Alle ${items.length} anzeigen`}
          <ChevronDown className={cn("size-3.5 transition-transform", all && "rotate-180")} aria-hidden />
        </button>
      )}
    </section>
  );
}
