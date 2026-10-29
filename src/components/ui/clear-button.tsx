import { X } from "lucide-react";
import { cn } from "@/lib/utils";

/**
 * Kleines X rechts in einem Suchfeld: leert den Inhalt und lässt den Fokus im Feld. Erscheint nur, wenn etwas drinsteht.
 * Das Feld braucht rechts Platz (z. B. pr-8) und einen Elternteil mit `relative`.
 */
export function ClearButton({ value, onClear, label = "Eingabe löschen", className }: { value: string; onClear: () => void; label?: string; className?: string }) {
  if (!value) return null;
  return (
    <button
      type="button"
      aria-label={label}
      title={label}
      // Fokus bleibt im Feld (kein Blur, Listen bleiben offen)
      onMouseDown={(e) => e.preventDefault()}
      onClick={(e) => {
        onClear();
        e.currentTarget.parentElement?.querySelector("input")?.focus();
      }}
      className={cn(
        "absolute top-1/2 right-1.5 inline-flex size-5 -translate-y-1/2 items-center justify-center rounded-full text-muted-foreground transition-colors duration-150 hover:bg-muted hover:text-foreground",
        className,
      )}
    >
      <X className="size-3.5" aria-hidden />
    </button>
  );
}
