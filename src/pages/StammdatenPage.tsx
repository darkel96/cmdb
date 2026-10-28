import { useEffect, useMemo, useState } from "react";
import { Check, Pencil, Plus, Search, Trash2, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { api } from "@/lib/api";
import type { StammdatenResponse } from "@/lib/stammdaten";
import { useAuth } from "@/state/auth";

type List = StammdatenResponse["lists"][number];

/** Eine Auswahlliste als Karte: Suchen, Hinzufügen (+), Bearbeiten (Stift), Löschen (Papierkorb mit Rückfrage) */
function LookupCard({ list, index, onChange }: { list: List; index: number; onChange: (action: "add" | "rename" | "delete", value: string, old?: string) => Promise<void> }) {
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
    <section className="animate-appear flex flex-col overflow-hidden rounded-lg border bg-card shadow-xs" style={{ "--i": index } as React.CSSProperties} aria-label={list.label}>
      <h2 className="bg-brand px-4 py-2.5 text-lg font-medium text-brand-foreground">{list.label}</h2>
      <div className="flex items-center gap-2 border-b px-3 py-2">
        <div className="relative flex-1">
          <Search className="pointer-events-none absolute left-2.5 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" aria-hidden />
          <Input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Suchen …" aria-label={`${list.label} durchsuchen`} className="h-8 pl-8" />
        </div>
        {can("stammdaten", "create") && (
          <Button type="button" variant="outline" size="sm" aria-label={`${list.label}: Wert hinzufügen`} onClick={() => { setAdding(true); setDraft(""); setEditing(null); }}>
            <Plus aria-hidden />
          </Button>
        )}
      </div>
      {list.error && <p className="px-4 py-3 text-sm text-destructive">{list.error}</p>}
      {error && <p role="alert" className="px-4 pt-2 text-sm text-destructive">{error}</p>}
      <ul className="scroll-thin max-h-64 py-1 text-sm" aria-label={`Werte ${list.label}`}>
        {adding && <li className="flex items-center gap-2 px-3 py-1">{editor(() => void run("add", draft), () => setAdding(false))}</li>}
        {visible.map((v) => (
          <li key={v} className="group flex min-h-8 items-center gap-2 px-3 py-0.5 odd:bg-muted/40 hover:bg-accent">
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
                <span className="flex-1 truncate" title={v}>{v}</span>
                {can("stammdaten", "edit") && (
                  <Button type="button" variant="ghost" size="sm" className="h-7 px-1.5" aria-label={`${v} bearbeiten`} onClick={() => { setEditing(v); setDraft(v); setAdding(false); }}>
                    <Pencil aria-hidden />
                  </Button>
                )}
                {can("stammdaten", "delete") && (
                  <Button type="button" variant="ghost" size="sm" className="h-7 px-1.5 text-destructive hover:text-destructive" aria-label={`${v} löschen`} onClick={() => setConfirm(v)}>
                    <Trash2 aria-hidden />
                  </Button>
                )}
              </>
            )}
          </li>
        ))}
        {visible.length === 0 && !adding && <li className="px-3 py-2 text-muted-foreground">Keine Werte.</li>}
      </ul>
      <p className="mt-auto border-t px-3 py-1.5 text-xs text-muted-foreground">{list.values.length} Werte</p>
    </section>
  );
}

/** Stammdaten: Auswahllisten der Formulare pflegen (wie GAPTEQ › Stammdaten) */
export function StammdatenPage() {
  const [data, setData] = useState<StammdatenResponse | null>(null);
  const [error, setError] = useState("");
  useEffect(() => {
    api.stammdaten().then(setData, (e: unknown) => setError(e instanceof Error ? e.message : String(e)));
  }, []);
  if (error) return <p role="alert" className="text-sm text-destructive">{error}</p>;
  if (!data) return <p className="text-sm text-muted-foreground">Wird geladen …</p>;
  return (
    <div className="flex w-full flex-col gap-3">
      <div>
        <h1 className="text-2xl font-semibold">Stammdaten</h1>
        <p className="text-sm text-muted-foreground">Auswahllisten der Formulare. Ändern oder Löschen eines Werts ändert keine bestehenden Einträge, wie in GAPTEQ.</p>
      </div>
      <div className="grid gap-4 lg:grid-cols-2 2xl:grid-cols-3">
        {data.lists.map((list, i) => (
          <LookupCard key={list.id} list={list} index={i} onChange={async (action, value, old) => setData(await api.changeLookup(list.id, action, value, old))} />
        ))}
      </div>
    </div>
  );
}
