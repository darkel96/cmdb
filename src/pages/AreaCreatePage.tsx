import { useEffect, useState, type FormEvent } from "react";
import { ArrowLeft, Save } from "lucide-react";
import { Link, useNavigate, useParams } from "react-router";
import { Button } from "@/components/ui/button";
import { Combobox } from "@/components/ui/combobox";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { api } from "@/lib/api";
import { AREAS, type AreaField, type AreaFormResponse } from "@/lib/areas";
import { cn } from "@/lib/utils";
import { NotFoundPage } from "./NotFoundPage";

/** Formular „Anlage“ eines Bereichs wie in GAPTEQ (nur Admins): füllt die nächste freie Zeile */
export function AreaCreatePage() {
  const { id = "" } = useParams();
  const navigate = useNavigate();
  const area = Object.hasOwn(AREAS, id) ? AREAS[id] : undefined;
  const [form, setForm] = useState<AreaFormResponse | null>(null);
  const [values, setValues] = useState<Record<string, string>>({});
  const [missing, setMissing] = useState<string[]>([]);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (!area?.createFields) return;
    setValues(Object.fromEntries(area.fields.filter((f) => f.defaultValue).map((f) => [f.key, f.defaultValue!])));
    api.areaForm(area.id).then(setForm, (e: unknown) => setError(e instanceof Error ? e.message : String(e)));
  }, [area]);

  if (!area?.createFields) return <NotFoundPage />;
  const fields = area.createFields.map((key) => area.fields.find((f) => f.key === key)).filter((f): f is AreaField => Boolean(f));

  async function save(e: FormEvent) {
    e.preventDefault();
    if (!area) return;
    const empty = fields.filter((f) => f.required && !values[f.key]?.trim()).map((f) => f.key);
    setMissing(empty);
    if (empty.length) {
      setError("Bitte alle Pflichtfelder (*) ausfüllen.");
      return;
    }
    setBusy(true);
    setError("");
    try {
      const { id: newId } = await api.createAreaRow(area.id, Object.fromEntries(fields.map((f) => [f.key, values[f.key] ?? ""])));
      navigate(`/bereich/${area.id}/${newId}`, { viewTransition: true, state: { created: true } });
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setBusy(false);
    }
  }

  const set = (key: string, value: string) => {
    setValues((v) => ({ ...v, [key]: value }));
    setMissing((m) => m.filter((k) => k !== key));
  };

  return (
    <form onSubmit={save} noValidate className="flex w-full flex-col gap-3">
      <div className="flex items-center justify-between gap-2">
        <Button type="submit" size="sm" disabled={busy || !form}>
          <Save aria-hidden />
          {busy ? "Wird gespeichert …" : "Speichern"}
        </Button>
        <Button variant="outline" size="sm" asChild>
          <Link to={`/bereich/${area.id}`} viewTransition>
            <ArrowLeft aria-hidden />
            Zurück
          </Link>
        </Button>
      </div>
      {error && <p role="alert" className="rounded-md border border-destructive/30 bg-destructive/10 px-4 py-3 text-sm text-destructive">{error}</p>}
      <section className="animate-appear overflow-hidden rounded-lg border bg-card shadow-xs" aria-label={`Anlage ${area.singular}`}>
        <h1 className="bg-brand px-4 py-2.5 text-lg font-medium text-brand-foreground">Anlage {area.singular}</h1>
        <div className="grid gap-x-6 gap-y-4 p-4 sm:grid-cols-2 2xl:grid-cols-3">
          {/* ID und Typ nur zur Anzeige, eigene Zeile über den Eingabefeldern */}
          <div className="flex flex-wrap gap-x-12 gap-y-3 sm:col-span-2 2xl:col-span-3">
            <div className="flex flex-col gap-1.5">
              <span className="text-xs text-muted-foreground">ID (voraussichtlich)</span>
              <span className="text-sm tabular-nums" data-testid="next-id">{form?.nextId ?? "…"}</span>
            </div>
            <div className="flex flex-col gap-1.5">
              <span className="text-xs text-muted-foreground">Typ</span>
              <span className="text-sm">{area.typeValue}</span>
            </div>
          </div>
          {fields.map((f) => {
            const invalid = missing.includes(f.key);
            const options = form?.options[f.key];
            const common = { id: `f-${f.key}`, "aria-invalid": invalid || undefined, "aria-required": f.required || undefined };
            return (
              <div key={f.key} className="flex flex-col gap-1.5">
                <Label htmlFor={`f-${f.key}`} className={cn(invalid && "text-destructive")}>
                  {f.label}
                  {f.required && <span className="text-destructive"> *</span>}
                </Label>
                {f.options ? (
                  <Combobox
                    id={`f-${f.key}`}
                    value={values[f.key] ?? ""}
                    options={options ?? []}
                    onChange={(v) => set(f.key, v)}
                    placeholder={options ? "– bitte wählen –" : "Wird geladen …"}
                    clearable={!f.required}
                    required={f.required}
                    invalid={invalid}
                    disabled={!options}
                  />
                ) : (
                  <Input {...common} type={f.date ? "date" : "text"} maxLength={255} className={cn(invalid && "border-destructive")} value={values[f.key] ?? ""} onChange={(e) => set(f.key, e.target.value)} />
                )}
              </div>
            );
          })}
        </div>
        <p className="border-t px-4 py-2 text-xs text-muted-foreground">
          Gespeichert wird in die nächste freie Zeile von dbo.{area.table}, wie in GAPTEQ. Die ID kann sich ändern, wenn gleichzeitig jemand anderes anlegt.
        </p>
      </section>
    </form>
  );
}
