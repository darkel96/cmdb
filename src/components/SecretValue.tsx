import { useEffect, useState } from "react";
import { Check, Copy, Eye, EyeOff } from "lucide-react";
import { Button } from "@/components/ui/button";
import { api } from "@/lib/api";

const MASK = "••••••••";

/**
 * Passwort in der Detailansicht: verdeckt; Auge zeigt es an, Kopieren legt es in die Zwischenablage. Der Wert wird erst
 * beim Klick einzeln vom Dienst geholt (Recht Bearbeiten, wird protokolliert) und nach einer Minute wieder verdeckt.
 */
export function SecretValue({ areaId, id, label, allowed, present = true }: { areaId: string; id: number; label: string; allowed: boolean; present?: boolean }) {
  const [value, setValue] = useState<string | null>(null);
  const [shown, setShown] = useState(false);
  const [copied, setCopied] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    if (!shown) return;
    const t = setTimeout(() => setShown(false), 60_000);
    return () => clearTimeout(t);
  }, [shown]);

  useEffect(() => {
    if (!copied) return;
    const t = setTimeout(() => setCopied(false), 2000);
    return () => clearTimeout(t);
  }, [copied]);

  async function load(): Promise<string | null> {
    if (value !== null) return value;
    setError("");
    try {
      const { value: v } = await api.areaSecret(areaId, id);
      setValue(v);
      return v;
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
      return null;
    }
  }

  // Nichts hinterlegt: Strich statt Punkte, damit es nicht nach einem Passwort aussieht
  if (!present) return <span data-testid="secret-value">–</span>;
  if (!allowed) return <span title="Anzeigen nur mit dem Recht Bearbeiten">{MASK}</span>;
  return (
    <span className="inline-flex flex-wrap items-center gap-1">
      <span className="font-mono" data-testid="secret-value">
        {shown && value !== null ? value || "(leer)" : MASK}
      </span>
      <Button
        type="button"
        variant="ghost"
        size="sm"
        className="h-7 px-2"
        aria-label={shown ? `${label} verbergen` : `${label} anzeigen`}
        title={shown ? "Verbergen" : "Anzeigen"}
        onClick={async () => {
          if (shown) return setShown(false);
          if ((await load()) !== null) setShown(true);
        }}
      >
        {shown ? <EyeOff aria-hidden /> : <Eye aria-hidden />}
      </Button>
      <Button
        type="button"
        variant="ghost"
        size="sm"
        className="h-7 px-2"
        aria-label={`${label} kopieren`}
        title="In die Zwischenablage kopieren"
        onClick={async () => {
          const v = await load();
          if (v === null) return;
          try {
            await navigator.clipboard.writeText(v);
            setCopied(true);
          } catch {
            setError("Kopieren nicht möglich (Zwischenablage gesperrt).");
          }
        }}
      >
        {copied ? <Check className="text-success" aria-hidden /> : <Copy aria-hidden />}
      </Button>
      {copied && <span role="status" className="text-xs text-success">Kopiert</span>}
      {error && <span role="alert" className="text-xs text-destructive">{error}</span>}
    </span>
  );
}
