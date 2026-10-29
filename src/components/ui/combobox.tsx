import { useEffect, useMemo, useRef, useState } from "react";
import { Check, ChevronDown, Search } from "lucide-react";
import { Popover } from "radix-ui";
import { cn } from "@/lib/utils";

/**
 * Auswahlliste im Design der CMDB (die Liste des Browsers lässt sich nicht gestalten):
 * Suchfeld zum Filtern, Pfeiltasten und Enter, Hand als Zeiger, schmale Scrollleiste.
 */
export function Combobox({
  id,
  value,
  options,
  onChange,
  placeholder = "– bitte wählen –",
  clearable = true,
  invalid = false,
  disabled = false,
  required = false,
  className,
  label,
}: {
  id?: string;
  value: string;
  options: string[];
  onChange: (value: string) => void;
  placeholder?: string;
  /** Eintrag „– keine Auswahl –“ zum Leeren anbieten */
  clearable?: boolean;
  invalid?: boolean;
  disabled?: boolean;
  required?: boolean;
  /** Zusätzliche Klassen für das Feld, z. B. niedriger in Tabellenzeilen */
  className?: string;
  /** Beschriftung für Screenreader, wenn kein sichtbares Label daneben steht */
  label?: string;
}) {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [active, setActive] = useState(0);
  const listRef = useRef<HTMLDivElement>(null);
  const listId = id ? `${id}-liste` : undefined;

  // Erster Eintrag "" = Auswahl leeren
  const items = useMemo(() => {
    const q = query.trim().toLocaleLowerCase("de");
    const hits = q ? options.filter((o) => o.toLocaleLowerCase("de").includes(q)) : options;
    return clearable && !q ? ["", ...hits] : hits;
  }, [options, query, clearable]);

  useEffect(() => {
    if (!open) return;
    setQuery("");
    const index = Math.max(0, (clearable ? ["", ...options] : options).indexOf(value));
    setActive(index);
  }, [open, value, options, clearable]);

  useEffect(() => {
    listRef.current?.querySelector(`[data-index="${active}"]`)?.scrollIntoView({ block: "nearest" });
  }, [active, open]);

  function choose(v: string) {
    onChange(v);
    setOpen(false);
  }

  function onKeyDown(e: React.KeyboardEvent) {
    if (e.key === "ArrowDown") {
      e.preventDefault();
      setActive((i) => Math.min(items.length - 1, i + 1));
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      setActive((i) => Math.max(0, i - 1));
    } else if (e.key === "Enter") {
      e.preventDefault();
      if (items[active] !== undefined) choose(items[active]);
    }
  }

  return (
    <Popover.Root open={open} onOpenChange={setOpen}>
      <Popover.Trigger asChild disabled={disabled}>
        <button
          id={id}
          type="button"
          role="combobox"
          aria-expanded={open}
          aria-controls={listId}
          aria-haspopup="listbox"
          aria-invalid={invalid || undefined}
          aria-required={required || undefined}
          aria-label={label}
          data-slot="combobox"
          className={cn(
            "flex h-9 w-full items-center justify-between gap-2 rounded-md border border-input bg-transparent px-3 py-1 text-left text-base shadow-xs outline-none transition-[color,box-shadow,border-color] hover:border-ring focus-visible:border-ring focus-visible:ring-[3px] focus-visible:ring-ring/50 disabled:opacity-50 md:text-sm",
            invalid && "border-destructive",
            open && "border-ring ring-[3px] ring-ring/50",
            className,
          )}
        >
          <span className={cn("truncate", !value && "text-muted-foreground")}>{value || placeholder}</span>
          <ChevronDown className={cn("size-4 shrink-0 text-muted-foreground transition-transform duration-200", open && "rotate-180")} aria-hidden />
        </button>
      </Popover.Trigger>
      <Popover.Portal>
        <Popover.Content
          align="start"
          sideOffset={4}
          collisionPadding={8}
          className="animate-fade-in z-50 flex w-[var(--radix-popover-trigger-width)] min-w-56 flex-col overflow-hidden rounded-md border bg-card text-card-foreground shadow-lg"
          onKeyDown={onKeyDown}
        >
          <div className="relative border-b">
            <Search className="pointer-events-none absolute left-2.5 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" aria-hidden />
            <input
              autoFocus
              value={query}
              onChange={(e) => {
                setQuery(e.target.value);
                setActive(0);
              }}
              placeholder="Suchen …"
              aria-label="Auswahl durchsuchen"
              aria-controls={listId}
              aria-activedescendant={listId && items[active] !== undefined ? `${listId}-${active}` : undefined}
              className="h-9 w-full bg-transparent pr-3 pl-8 text-sm outline-none placeholder:text-muted-foreground"
            />
          </div>
          <div ref={listRef} id={listId} role="listbox" className="scroll-thin max-h-72 p-1">
            {items.map((item, i) => (
              <div
                key={item || "(leer)"}
                id={listId ? `${listId}-${i}` : undefined}
                data-index={i}
                role="option"
                aria-selected={item === value}
                onMouseMove={() => setActive(i)}
                onClick={() => choose(item)}
                className={cn(
                  "flex cursor-pointer items-center justify-between gap-2 rounded-sm px-2.5 py-1.5 text-sm transition-colors duration-75",
                  i === active && "bg-brand text-brand-foreground",
                  !item && i !== active && "text-muted-foreground",
                )}
              >
                <span className="truncate">{item || "– keine Auswahl –"}</span>
                {item === value && item !== "" && <Check className="size-4 shrink-0" aria-hidden />}
              </div>
            ))}
            {items.length === 0 && <p className="px-2.5 py-2 text-sm text-muted-foreground">Nichts gefunden.</p>}
          </div>
        </Popover.Content>
      </Popover.Portal>
    </Popover.Root>
  );
}
