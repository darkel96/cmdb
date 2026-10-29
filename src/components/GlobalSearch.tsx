import { useEffect, useId, useRef, useState } from "react";
import { Loader2, Search } from "lucide-react";
import { useNavigate } from "react-router";
import { api } from "@/lib/api";
import { SEARCH_MAX, SEARCH_MIN, searchTerms, type SearchGroup, type SearchHit, type SearchResponse } from "@/lib/search";
import { cn } from "@/lib/utils";

/** Fundstellen aller Suchwörter im Text hervorheben */
function Highlight({ text, query }: { text: string; query: string }) {
  const terms = searchTerms(query);
  if (!terms.length) return <>{text}</>;
  const pattern = new RegExp(`(${terms.map((t) => t.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")).join("|")})`, "gi");
  return (
    <>
      {text.split(pattern).map((part, i) =>
        i % 2 ? (
          <mark key={i} className="rounded-sm bg-brand/15 text-inherit">
            {part}
          </mark>
        ) : (
          part
        ),
      )}
    </>
  );
}

type Option = { kind: "hit"; group: SearchGroup; hit: SearchHit } | { kind: "all"; group: SearchGroup };

const hrefOf = (o: Option) =>
  o.kind === "all" ? `/bereich/${o.group.id}${o.group.filter ? `?suche=${encodeURIComponent(o.group.filter)}` : ""}` : o.group.id === "kunden" ? `/kunden/${o.hit.id}` : `/bereich/${o.group.id}/${o.hit.id}`;

/**
 * Suchfeld in der Kopfzeile (Strg+K): ein Begriff über alle Bereiche, die man lesen darf, und die Kunden.
 * Treffer nach Bereich gruppiert, Pfeiltasten und Enter öffnen, Esc schließt.
 */
export function GlobalSearch() {
  const navigate = useNavigate();
  const listId = useId();
  const inputRef = useRef<HTMLInputElement>(null);
  const [q, setQ] = useState("");
  const [open, setOpen] = useState(false);
  const [result, setResult] = useState<SearchResponse | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [active, setActive] = useState(0);
  const term = q.trim();

  // Strg+K bzw. Cmd+K von überall
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === "k") {
        e.preventDefault();
        inputRef.current?.focus();
        inputRef.current?.select();
        setOpen(true);
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  // Kurz nach dem Tippen suchen; ältere Antworten verwerfen
  useEffect(() => {
    if (term.length < SEARCH_MIN) {
      setResult(null);
      setLoading(false);
      setError("");
      return;
    }
    let stale = false;
    setLoading(true);
    const timer = setTimeout(() => {
      api.search(term).then(
        (r) => {
          if (stale) return;
          setResult(r);
          setActive(0);
          setError("");
          setLoading(false);
        },
        (e: unknown) => {
          if (stale) return;
          setError(e instanceof Error ? e.message : String(e));
          setLoading(false);
        },
      );
    }, 200);
    return () => {
      stale = true;
      clearTimeout(timer);
    };
  }, [term]);

  const options: Option[] = (result?.groups ?? []).flatMap((group) => [
    ...group.hits.map((hit): Option => ({ kind: "hit", group, hit })),
    ...(group.id !== "kunden" && group.total > group.hits.length ? [{ kind: "all", group } as Option] : []),
  ]);
  const shown = open && term.length >= SEARCH_MIN;
  const optionId = (i: number) => `${listId}-${i}`;

  const choose = (o: Option) => {
    setOpen(false);
    setQ("");
    inputRef.current?.blur();
    navigate(hrefOf(o), { viewTransition: true });
  };

  const onKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === "Escape") {
      if (open && q) setQ("");
      else inputRef.current?.blur();
      setOpen(false);
    } else if (e.key === "ArrowDown" || e.key === "ArrowUp") {
      e.preventDefault();
      setOpen(true);
      if (options.length) setActive((a) => (a + (e.key === "ArrowDown" ? 1 : options.length - 1)) % options.length);
    } else if (e.key === "Enter" && options[active]) {
      e.preventDefault();
      choose(options[active]);
    }
  };

  let index = -1;
  return (
    <div className="relative min-w-0 flex-1 sm:max-w-md" onBlur={(e) => !e.currentTarget.contains(e.relatedTarget) && setOpen(false)}>
      <Search className={cn("pointer-events-none absolute left-2.5 top-1/2 size-4 -translate-y-1/2", open ? "text-muted-foreground" : "text-white/80")} aria-hidden />
      <input
        ref={inputRef}
        type="search"
        role="combobox"
        aria-label="Globale Suche"
        aria-expanded={shown}
        aria-controls={listId}
        aria-autocomplete="list"
        aria-activedescendant={shown && options[active] ? optionId(active) : undefined}
        value={q}
        maxLength={SEARCH_MAX}
        onChange={(e) => {
          setQ(e.target.value);
          setOpen(true);
        }}
        onFocus={() => setOpen(true)}
        onKeyDown={onKeyDown}
        placeholder="Suchen: Hostname, IP, Servicetag, Kunde …"
        className={cn(
          "h-8 w-full rounded-md border border-transparent pr-14 pl-8 text-sm outline-none transition-colors duration-150 [&::-webkit-search-cancel-button]:hidden",
          open ? "bg-card text-foreground placeholder:text-muted-foreground" : "bg-white/15 text-white placeholder:text-white/75 hover:bg-white/25",
        )}
      />
      <kbd className={cn("pointer-events-none absolute right-2 top-1/2 hidden -translate-y-1/2 rounded border px-1.5 text-[10px] font-medium sm:block", open ? "text-muted-foreground" : "border-white/40 text-white/80")}>
        Strg K
      </kbd>

      {shown && (
        <div
          id={listId}
          role="listbox"
          aria-label="Suchergebnisse"
          className="scroll-thin absolute left-0 top-full z-50 mt-1 max-h-[70vh] w-full min-w-[20rem] rounded-lg border bg-card p-1 text-foreground shadow-lg sm:min-w-[28rem]"
        >
          {loading && !result && (
            <p className="flex items-center gap-2 px-3 py-2 text-sm text-muted-foreground">
              <Loader2 className="size-4 animate-spin" aria-hidden /> Wird gesucht …
            </p>
          )}
          {error && <p role="alert" className="px-3 py-2 text-sm text-destructive">{error}</p>}
          {result && !error && result.groups.length === 0 && !loading && <p className="px-3 py-2 text-sm text-muted-foreground">Nichts gefunden für „{term}“.</p>}
          {!error &&
            result?.groups.map((group) => (
              <div key={group.id} role="group" aria-label={group.label} className="py-1">
                <div className="flex items-center justify-between px-2.5 pb-1 text-xs font-medium text-muted-foreground">
                  <span>{group.label}</span>
                  <span className="tabular-nums">{group.total}</span>
                </div>
                {group.hits.map((hit) => {
                  const i = ++index;
                  return (
                    <div
                      key={hit.id}
                      id={optionId(i)}
                      role="option"
                      aria-selected={i === active}
                      onMouseDown={(e) => e.preventDefault()}
                      onMouseEnter={() => setActive(i)}
                      onClick={() => choose(options[i])}
                      className={cn("flex cursor-pointer items-baseline gap-2 rounded-md px-2.5 py-1.5 text-sm", i === active && "bg-accent")}
                    >
                      <span className="w-14 shrink-0 text-xs tabular-nums text-muted-foreground">{group.id === "kunden" ? "" : hit.id}</span>
                      <span className="min-w-0 flex-1">
                        <span className="block truncate font-medium">
                          <Highlight text={hit.title} query={term} />
                        </span>
                        <span className="block truncate text-xs text-muted-foreground">
                          {hit.subtitle}
                          {hit.field && (
                            <>
                              {hit.subtitle && " · "}
                              {hit.field}: <Highlight text={hit.value} query={term} />
                            </>
                          )}
                        </span>
                      </span>
                    </div>
                  );
                })}
                {group.id !== "kunden" && group.total > group.hits.length && (() => {
                  const i = ++index;
                  return (
                    <div
                      id={optionId(i)}
                      role="option"
                      aria-selected={i === active}
                      onMouseDown={(e) => e.preventDefault()}
                      onMouseEnter={() => setActive(i)}
                      onClick={() => choose(options[i])}
                      className={cn("cursor-pointer rounded-md px-2.5 py-1 pl-[4.6rem] text-xs text-brand", i === active && "bg-accent")}
                    >
                      Alle {group.total} in {group.label} anzeigen
                    </div>
                  );
                })()}
              </div>
            ))}
        </div>
      )}
    </div>
  );
}
