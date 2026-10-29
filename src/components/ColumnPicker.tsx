import { useMemo, useState } from "react";
import { Check, ChevronDown, Search } from "lucide-react";
import { Popover } from "radix-ui";
import { cn } from "@/lib/utils";

/** Anzeige für leere Werte in der Auswahl */
export const EMPTY_VALUE = "(leer)";

/**
 * Wertefilter einer Spalte wie in Excel: alle vorkommenden Werte mit Anzahl, Mehrfachauswahl per Häkchen.
 * Die Werte kommen von der Tabelle (gefiltert nach den übrigen Spalten).
 */
export function ColumnPicker({
  label,
  load,
  picked,
  onChange,
}: {
  label: string;
  /** Werte mit Anzahl; erst beim Öffnen berechnet */
  load: () => { value: string; count: number }[];
  picked: string[];
  onChange: (picked: string[]) => void;
}) {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  // eslint-disable-next-line react-hooks/exhaustive-deps
  const values = useMemo(() => (open ? load() : []), [open, picked]);
  const shown = useMemo(() => {
    const q = query.trim().toLocaleLowerCase("de");
    return q ? values.filter((v) => v.value.toLocaleLowerCase("de").includes(q)) : values;
  }, [values, query]);
  const toggle = (v: string) => onChange(picked.includes(v) ? picked.filter((x) => x !== v) : [...picked, v]);

  return (
    <Popover.Root open={open} onOpenChange={(o) => { setOpen(o); if (!o) setQuery(""); }}>
      <Popover.Trigger asChild>
        <button
          type="button"
          aria-label={`Werte ${label} auswählen`}
          title="Werte auswählen"
          className={cn(
            "flex h-5 items-center gap-0.5 rounded px-1 text-xs transition-colors duration-100",
            picked.length ? "bg-brand text-brand-foreground" : "text-muted-foreground hover:bg-accent hover:text-foreground",
          )}
        >
          {picked.length > 0 && <span className="tabular-nums">{picked.length}</span>}
          <ChevronDown className="size-3.5" aria-hidden />
        </button>
      </Popover.Trigger>
      <Popover.Portal>
        <Popover.Content
          align="start"
          sideOffset={6}
          collisionPadding={8}
          className="animate-fade-in z-50 flex w-64 flex-col overflow-hidden rounded-md border bg-card text-sm text-card-foreground shadow-lg"
        >
          {values.length > 8 && (
            <div className="relative border-b">
              <Search className="pointer-events-none absolute left-2.5 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" aria-hidden />
              <input
                autoFocus
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                placeholder="Werte suchen …"
                aria-label={`Werte ${label} durchsuchen`}
                className="h-9 w-full bg-transparent pr-3 pl-8 outline-none placeholder:text-muted-foreground"
              />
            </div>
          )}
          <ul role="listbox" aria-multiselectable="true" aria-label={`Werte ${label}`} className="scroll-thin max-h-72 p-1">
            {shown.map((v) => {
              const on = picked.includes(v.value);
              return (
                <li key={v.value} role="option" aria-selected={on}>
                  <button
                    type="button"
                    onClick={() => toggle(v.value)}
                    className="flex w-full items-center gap-2 rounded-sm px-2 py-1.5 text-left hover:bg-accent"
                  >
                    <span className={cn("flex size-4 shrink-0 items-center justify-center rounded border", on ? "border-brand bg-brand text-brand-foreground" : "border-input")}>
                      {on && <Check className="size-3" aria-hidden />}
                    </span>
                    <span className={cn("flex-1 truncate", v.value === EMPTY_VALUE && "text-muted-foreground")} title={v.value}>
                      {v.value}
                    </span>
                    <span className="text-xs tabular-nums text-muted-foreground">{v.count}</span>
                  </button>
                </li>
              );
            })}
            {shown.length === 0 && <li className="px-2 py-2 text-muted-foreground">Nichts gefunden.</li>}
          </ul>
          <div className="flex items-center justify-between gap-2 border-t px-2 py-1.5">
            <button type="button" className="text-xs text-brand hover:underline disabled:text-muted-foreground disabled:no-underline" disabled={!picked.length} onClick={() => onChange([])}>
              Auswahl aufheben
            </button>
            <button type="button" className="rounded px-2 py-1 text-xs font-medium hover:bg-accent" onClick={() => setOpen(false)}>
              Fertig
            </button>
          </div>
        </Popover.Content>
      </Popover.Portal>
    </Popover.Root>
  );
}
