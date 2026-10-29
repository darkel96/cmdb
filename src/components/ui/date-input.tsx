import { useEffect, useMemo, useState } from "react";
import { CalendarDays, ChevronLeft, ChevronRight, ChevronsLeft, ChevronsRight } from "lucide-react";
import { Popover } from "radix-ui";
import { cn } from "@/lib/utils";

const MONTHS = ["Januar", "Februar", "März", "April", "Mai", "Juni", "Juli", "August", "September", "Oktober", "November", "Dezember"];
const WEEKDAYS = ["Mo", "Di", "Mi", "Do", "Fr", "Sa", "So"];

const pad = (n: number) => String(n).padStart(2, "0");
const toIso = (d: Date) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
const toDe = (iso: string) => (iso ? `${iso.slice(8, 10)}.${iso.slice(5, 7)}.${iso.slice(0, 4)}` : "");

/** „31.12.2026“, „1.2.27“ oder „2026-12-31“ → JJJJ-MM-TT; ungültig → null */
export function parseDate(text: string): string | null {
  const t = text.trim();
  let y: number, m: number, d: number;
  let match = /^(\d{4})-(\d{1,2})-(\d{1,2})$/.exec(t);
  if (match) [y, m, d] = [Number(match[1]), Number(match[2]), Number(match[3])];
  else if ((match = /^(\d{1,2})\.(\d{1,2})\.(\d{2}|\d{4})$/.exec(t))) {
    [d, m, y] = [Number(match[1]), Number(match[2]), Number(match[3])];
    if (y < 100) y += 2000;
  } else return null;
  const date = new Date(y, m - 1, d);
  return date.getFullYear() === y && date.getMonth() === m - 1 && date.getDate() === d ? toIso(date) : null;
}

/**
 * Datumsfeld im Design der CMDB: Klick irgendwo ins Feld öffnet den Kalender (Montag zuerst, Monat und Jahr
 * blättern, Heute, Löschen); Tippen geht weiter („31.12.2026“). Wert immer als JJJJ-MM-TT.
 */
export function DateInput({
  id,
  value,
  onChange,
  invalid = false,
  className,
  "aria-required": ariaRequired,
}: {
  id?: string;
  value: string;
  onChange: (iso: string) => void;
  invalid?: boolean;
  className?: string;
  "aria-required"?: boolean;
}) {
  const [open, setOpen] = useState(false);
  const [draft, setDraft] = useState(toDe(value));
  const [wrong, setWrong] = useState(false);
  const selected = value ? new Date(`${value}T00:00:00`) : null;
  const [month, setMonth] = useState(() => selected ?? new Date());

  // Wert von außen (z. B. Bearbeiten lädt den Eintrag) übernehmen
  useEffect(() => {
    setDraft(toDe(value));
    setWrong(false);
  }, [value]);
  useEffect(() => {
    if (open) setMonth(value ? new Date(`${value}T00:00:00`) : new Date());
  }, [open, value]);

  const days = useMemo(() => {
    const first = new Date(month.getFullYear(), month.getMonth(), 1);
    const offset = (first.getDay() + 6) % 7; // Montag = 0
    return Array.from({ length: 42 }, (_, i) => new Date(month.getFullYear(), month.getMonth(), 1 - offset + i));
  }, [month]);

  const today = toIso(new Date());
  const pick = (iso: string) => {
    onChange(iso);
    setDraft(toDe(iso));
    setWrong(false);
    setOpen(false);
  };
  const shift = (months: number) => setMonth((m) => new Date(m.getFullYear(), m.getMonth() + months, 1));

  const commit = () => {
    if (!draft.trim()) {
      if (value) onChange("");
      setWrong(false);
      return;
    }
    const iso = parseDate(draft);
    if (iso) {
      if (iso !== value) onChange(iso);
      setDraft(toDe(iso));
      setWrong(false);
    } else setWrong(true);
  };

  const nav = "flex size-7 items-center justify-center rounded text-muted-foreground transition-colors hover:bg-accent hover:text-foreground";

  return (
    <Popover.Root open={open} onOpenChange={setOpen}>
      <Popover.Anchor asChild>
        <div className={cn("relative", className)}>
          <input
            id={id}
            value={draft}
            inputMode="numeric"
            placeholder="TT.MM.JJJJ"
            autoComplete="off"
            aria-invalid={invalid || wrong || undefined}
            aria-required={ariaRequired}
            aria-haspopup="dialog"
            aria-expanded={open}
            title={wrong ? "Datum als TT.MM.JJJJ eingeben" : undefined}
            onClick={() => setOpen(true)}
            onChange={(e) => {
              setDraft(e.target.value);
              // Vollständig getippt: sofort übernehmen
              const iso = parseDate(e.target.value);
              if (iso) {
                onChange(iso);
                setWrong(false);
              } else if (!e.target.value.trim()) onChange("");
            }}
            onBlur={commit}
            onKeyDown={(e) => {
              if (e.key === "Enter") {
                e.preventDefault();
                commit();
                setOpen(false);
              }
              if (e.key === "ArrowDown") setOpen(true);
              if (e.key === "Escape") setOpen(false);
            }}
            data-slot="input"
            className={cn(
              "flex h-9 w-full min-w-0 cursor-pointer rounded-md border border-input bg-transparent px-3 py-1 pr-9 text-base tabular-nums shadow-xs outline-none transition-[color,box-shadow,border-color] placeholder:text-muted-foreground hover:border-ring focus-visible:border-ring focus-visible:ring-[3px] focus-visible:ring-ring/50 md:text-sm",
              (invalid || wrong) && "border-destructive",
              open && "border-ring ring-[3px] ring-ring/50",
            )}
          />
          <button
            type="button"
            tabIndex={-1}
            aria-label="Kalender öffnen"
            onClick={() => setOpen((o) => !o)}
            className="absolute top-1/2 right-1 flex size-7 -translate-y-1/2 items-center justify-center rounded text-muted-foreground hover:bg-accent hover:text-foreground"
          >
            <CalendarDays className="size-4" aria-hidden />
          </button>
        </div>
      </Popover.Anchor>
      <Popover.Portal>
        <Popover.Content
          align="start"
          sideOffset={4}
          collisionPadding={8}
          // Fokus bleibt im Feld, damit man weiter tippen kann
          onOpenAutoFocus={(e) => e.preventDefault()}
          onInteractOutside={(e) => {
            if (id && (e.target as Element | null)?.closest?.(`#${CSS.escape(id)}`)) e.preventDefault();
          }}
          role="dialog"
          aria-label="Kalender"
          className="animate-fade-in z-50 w-72 rounded-md border bg-card p-3 text-card-foreground shadow-lg"
        >
          <div className="mb-2 flex items-center justify-between gap-1">
            <span className="flex">
              <button type="button" className={nav} aria-label="Ein Jahr zurück" onClick={() => shift(-12)}>
                <ChevronsLeft className="size-4" aria-hidden />
              </button>
              <button type="button" className={nav} aria-label="Ein Monat zurück" onClick={() => shift(-1)}>
                <ChevronLeft className="size-4" aria-hidden />
              </button>
            </span>
            <span className="text-sm font-semibold" aria-live="polite">
              {MONTHS[month.getMonth()]} {month.getFullYear()}
            </span>
            <span className="flex">
              <button type="button" className={nav} aria-label="Ein Monat weiter" onClick={() => shift(1)}>
                <ChevronRight className="size-4" aria-hidden />
              </button>
              <button type="button" className={nav} aria-label="Ein Jahr weiter" onClick={() => shift(12)}>
                <ChevronsRight className="size-4" aria-hidden />
              </button>
            </span>
          </div>
          <div className="grid grid-cols-7 gap-0.5 text-center text-xs">
            {WEEKDAYS.map((w) => (
              <span key={w} className="py-1 font-medium text-muted-foreground">
                {w}
              </span>
            ))}
            {days.map((d) => {
              const iso = toIso(d);
              const inMonth = d.getMonth() === month.getMonth();
              const isSelected = iso === value;
              return (
                <button
                  key={iso}
                  type="button"
                  aria-label={toDe(iso)}
                  aria-pressed={isSelected}
                  onClick={() => pick(iso)}
                  className={cn(
                    "flex h-8 items-center justify-center rounded-md text-sm tabular-nums transition-colors duration-75",
                    isSelected ? "bg-brand font-medium text-brand-foreground" : "hover:bg-accent",
                    !isSelected && !inMonth && "text-muted-foreground/60",
                    !isSelected && iso === today && "ring-1 ring-brand ring-inset",
                  )}
                >
                  {d.getDate()}
                </button>
              );
            })}
          </div>
          <div className="mt-2 flex items-center justify-between border-t pt-2">
            <button type="button" className="text-xs text-brand hover:underline" onClick={() => pick("")}>
              Löschen
            </button>
            <button type="button" className="text-xs text-brand hover:underline" onClick={() => pick(today)}>
              Heute
            </button>
          </div>
        </Popover.Content>
      </Popover.Portal>
    </Popover.Root>
  );
}
