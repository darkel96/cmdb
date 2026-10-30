import { useEffect, useMemo, useState } from "react";
import { CalendarClock, Check, Pencil, Plus, Search, Trash2, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { DateInput } from "@/components/ui/date-input";
import { Input } from "@/components/ui/input";
import { ClearButton } from "@/components/ui/clear-button";
import { api } from "@/lib/api";
import type { OsSupportEntry } from "@/lib/osSupport";
import type { StammdatenResponse } from "@/lib/stammdaten";
import { cn } from "@/lib/utils";
import { useAuth } from "@/state/auth";

type List = StammdatenResponse["lists"][number];

/** Die gewählte Auswahlliste: Suchen, Hinzufügen, Bearbeiten (Stift), Löschen (Papierkorb mit Rückfrage) */
const deDate = (iso: string) => (iso ? `${iso.slice(8, 10)}.${iso.slice(5, 7)}.${iso.slice(0, 4)}` : "–");

/** Support-Ende eines Betriebssystems (nur Server-OS): Anzeige, abgelaufen rot, weniger als 6 Monate gelb */
function SupportInfo({ entry }: { entry?: OsSupportEntry }) {
  if (!entry?.extendedEnd) return <span className="text-xs text-muted-foreground">kein Support-Ende hinterlegt</span>;
  const today = new Date().toISOString().slice(0, 10);
  const soon = new Date(Date.now() + 182 * 86400_000).toISOString().slice(0, 10);
  const tone = entry.extendedEnd < today ? "text-destructive" : entry.extendedEnd < soon ? "text-warning-fg" : "text-muted-foreground";
  return (
    <span className="flex gap-3 text-xs tabular-nums">
      <span className="text-muted-foreground">allgemein bis {deDate(entry.mainstreamEnd)}</span>
      <span className={tone}>LTS bis {deDate(entry.extendedEnd)}{entry.extendedEnd < today ? " · abgelaufen" : ""}</span>
    </span>
  );
}

function LookupPanel({
  list,
  onChange,
  support,
  onSupport,
}: {
  list: List;
  onChange: (action: "add" | "rename" | "delete", value: string, old?: string) => Promise<void>;
  /** Nur Server-OS: Support-Ende je Wert */
  support?: Map<string, OsSupportEntry>;
  onSupport?: (entry: OsSupportEntry) => Promise<void>;
}) {
  const [dating, setDating] = useState<string | null>(null);
  const [dates, setDates] = useState({ mainstreamEnd: "", extendedEnd: "" });
  const { can } = useAuth();
  const [search, setSearch] = useState("");
  const [adding, setAdding] = useState(false);
  const [draft, setDraft] = useState("");
  const [editing, setEditing] = useState<string | null>(null);
  const [confirm, setConfirm] = useState<string | null>(null);
  const [error, setError] = useState("");
  const visible = useMemo(() => list.values.filter((v) => v.toLocaleLowerCase("de").includes(search.trim().toLocaleLowerCase("de"))), [list.values, search]);

  async function run(action: "add" | "rename" | "delete", value: string, old?: string) {
    setError("");
    try {
      await onChange(action, value.trim(), old);
      setAdding(false);
      setEditing(null);
      setConfirm(null);
      setDraft("");
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    }
  }

  const editor = (submit: () => void, cancel: () => void) => (
    <span className="flex flex-1 items-center gap-1">
      <Input
        autoFocus
        aria-label={`Wert für ${list.label}`}
        className="h-7"
        maxLength={list.maxLength}
        value={draft}
        onChange={(e) => setDraft(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === "Enter") {
            e.preventDefault();
            submit();
          }
          if (e.key === "Escape") cancel();
        }}
      />
      <Button type="button" size="sm" className="h-7 px-2" aria-label="Übernehmen" onClick={submit}>
        <Check aria-hidden />
      </Button>
      <Button type="button" variant="ghost" size="sm" className="h-7 px-2" aria-label="Abbrechen" onClick={cancel}>
        <X aria-hidden />
      </Button>
    </span>
  );

  return (
    <section className="animate-appear flex min-h-0 flex-col overflow-hidden rounded-lg border bg-card shadow-xs" aria-label={list.label}>
      <div className="flex flex-wrap items-center gap-2 border-b px-4 py-3">
        <div className="mr-auto">
          <h2 className="font-semibold">{list.label}</h2>
          <p className="text-xs text-muted-foreground">{list.values.length} Werte</p>
        </div>
        <div className="relative w-full sm:w-64">
          <Search className="pointer-events-none absolute left-2.5 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" aria-hidden />
          <Input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Suchen …" aria-label={`${list.label} durchsuchen`} className="h-8 pr-8 pl-8" />
          <ClearButton value={search} label="Suche löschen" onClear={() => setSearch("")} />
        </div>
        {can("stammdaten", "create") && (
          <Button type="button" size="sm" aria-label={`${list.label}: Wert hinzufügen`} onClick={() => { setAdding(true); setDraft(""); setEditing(null); }}>
            <Plus aria-hidden />
            Wert hinzufügen
          </Button>
        )}
      </div>
      {list.error && <p className="px-4 py-3 text-sm text-destructive">{list.error}</p>}
      {error && <p role="alert" className="px-4 pt-2 text-sm text-destructive">{error}</p>}
      <ul className="scroll-thin max-h-[calc(100svh-17rem)] min-h-40 py-1 text-sm" aria-label={`Werte ${list.label}`}>
        {adding && <li className="flex items-center gap-2 px-4 py-1">{editor(() => void run("add", draft), () => setAdding(false))}</li>}
        {visible.map((v) => (
          <li key={v} className="group flex min-h-9 items-center gap-2 border-b border-border/50 px-4 py-0.5 last:border-b-0 hover:bg-accent">
            {editing === v ? (
              editor(() => void run("rename", draft, v), () => setEditing(null))
            ) : confirm === v ? (
              <span role="alertdialog" aria-label={`${v} löschen`} className="flex flex-1 items-center justify-between gap-2">
                <span>„{v}“ löschen?</span>
                <span className="flex gap-1">
                  <Button type="button" size="sm" className="h-7 bg-destructive px-2 hover:bg-destructive/90" onClick={() => void run("delete", v)}>Ja, löschen</Button>
                  <Button type="button" variant="ghost" size="sm" className="h-7 px-2" onClick={() => setConfirm(null)}>Abbrechen</Button>
                </span>
              </span>
            ) : (
              <>
                <span className="flex min-w-0 flex-1 flex-wrap items-baseline gap-x-4">
                  <span className="truncate" title={v}>{v}</span>
                  {support && dating !== v && <SupportInfo entry={support.get(v)} />}
                </span>
                {support && dating === v && (
                  <span className="flex flex-wrap items-center gap-2 text-xs" role="group" aria-label={`Support-Ende ${v}`}>
                    <label className="flex items-center gap-1">
                      allgemein bis
                      <DateInput className="w-40" value={dates.mainstreamEnd} onChange={(v) => setDates((d) => ({ ...d, mainstreamEnd: v }))} />
                    </label>
                    <label className="flex items-center gap-1">
                      LTS bis
                      <DateInput className="w-40" value={dates.extendedEnd} onChange={(v) => setDates((d) => ({ ...d, extendedEnd: v }))} />
                    </label>
                    <Button
                      type="button"
                      size="sm"
                      className="h-7 px-2"
                      aria-label="Übernehmen"
                      onClick={async () => {
                        setError("");
                        try {
                          await onSupport?.({ name: v, ...dates });
                          setDating(null);
                        } catch (e) {
                          setError(e instanceof Error ? e.message : String(e));
                        }
                      }}
                    >
                      <Check aria-hidden />
                    </Button>
                    <Button type="button" variant="ghost" size="sm" className="h-7 px-2" aria-label="Abbrechen" onClick={() => setDating(null)}>
                      <X aria-hidden />
                    </Button>
                  </span>
                )}
                {support && dating !== v && can("stammdaten", "edit") && (
                  <Button
                    type="button"
                    variant="ghost"
                    size="sm"
                    className="h-7 px-1.5 opacity-0 transition-opacity group-hover:opacity-100 focus-visible:opacity-100"
                    aria-label={`Support-Ende ${v} bearbeiten`}
                    title="Support-Ende bearbeiten"
                    onClick={() => {
                      const e = support.get(v);
                      setDates({ mainstreamEnd: e?.mainstreamEnd ?? "", extendedEnd: e?.extendedEnd ?? "" });
                      setDating(v);
                    }}
                  >
                    <CalendarClock aria-hidden />
                  </Button>
                )}
                {can("stammdaten", "edit") && (
                  <Button type="button" variant="ghost" size="sm" className="h-7 px-1.5 opacity-0 transition-opacity group-hover:opacity-100 focus-visible:opacity-100" aria-label={`${v} bearbeiten`} onClick={() => { setEditing(v); setDraft(v); setAdding(false); }}>
                    <Pencil aria-hidden />
                  </Button>
                )}
                {can("stammdaten", "delete") && (
                  <Button type="button" variant="ghost" size="sm" className="h-7 px-1.5 text-destructive opacity-0 transition-opacity group-hover:opacity-100 focus-visible:opacity-100 hover:text-destructive" aria-label={`${v} löschen`} onClick={() => setConfirm(v)}>
                    <Trash2 aria-hidden />
                  </Button>
                )}
              </>
            )}
          </li>
        ))}
        {visible.length === 0 && !adding && <li className="px-4 py-3 text-muted-foreground">{search.trim() ? "Nichts gefunden." : "Keine Werte."}</li>}
      </ul>
    </section>
  );
}

/** Stammdaten: links die Auswahllisten, rechts die gewählte zum Pflegen (wie GAPTEQ › Stammdaten, aufgeräumter) */
export function StammdatenPage() {
  const [data, setData] = useState<StammdatenResponse | null>(null);
  const [error, setError] = useState("");
  const [selected, setSelected] = useState("");
  const [support, setSupport] = useState<OsSupportEntry[]>([]);
  useEffect(() => {
    api.stammdaten().then(setData, (e: unknown) => setError(e instanceof Error ? e.message : String(e)));
    api.osSupport().then((r) => setSupport(r.items), () => undefined);
  }, []);
  if (error) return <p role="alert" className="text-sm text-destructive">{error}</p>;
  if (!data) return <p className="text-sm text-muted-foreground">Wird geladen …</p>;
  const list = data.lists.find((l) => l.id === selected) ?? data.lists[0];
  return (
    <div className="flex w-full flex-col gap-3">
      <p className="text-sm text-muted-foreground">Auswahllisten der Formulare. Ändern oder Löschen eines Werts ändert keine bestehenden Einträge, wie in GAPTEQ.</p>
      <div className="grid items-start gap-4 md:grid-cols-[15rem_minmax(0,1fr)]">
        <nav aria-label="Auswahllisten" className="animate-appear overflow-hidden rounded-lg border bg-card p-1 shadow-xs">
          <ul className="flex flex-col gap-0.5">
            {data.lists.map((l) => (
              <li key={l.id}>
                <button
                  type="button"
                  aria-current={l.id === list.id ? "true" : undefined}
                  onClick={() => setSelected(l.id)}
                  className={cn(
                    "flex w-full items-center justify-between gap-2 rounded-md px-3 py-2 text-left text-sm transition-colors duration-100",
                    l.id === list.id ? "bg-brand text-brand-foreground" : "hover:bg-accent",
                  )}
                >
                  <span className="truncate">{l.label}</span>
                  <span className={cn("rounded px-1.5 text-xs tabular-nums", l.id === list.id ? "bg-white/20" : "bg-muted text-muted-foreground")}>
                    {l.error ? "!" : l.values.length}
                  </span>
                </button>
              </li>
            ))}
          </ul>
        </nav>
        <LookupPanel
          key={list.id}
          list={list}
          onChange={async (action, value, old) => {
            setData(await api.changeLookup(list.id, action, value, old));
            // Server-OS umbenannt/gelöscht: Support-Daten folgen im Dienst, hier neu laden
            if (list.id === "server-os") setSupport((await api.osSupport()).items);
          }}
          {...(list.id === "server-os"
            ? { support: new Map(support.map((e) => [e.name, e])), onSupport: async (entry: OsSupportEntry) => setSupport((await api.saveOsSupport(entry)).items) }
            : {})}
        />
      </div>
    </div>
  );
}
