import { useEffect, useState, type FormEvent } from "react";
import { ArrowLeft, Eye, EyeOff, Save } from "lucide-react";
import { Link, useLocation, useNavigate, useParams } from "react-router";
import { Button } from "@/components/ui/button";
import { Combobox } from "@/components/ui/combobox";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { api } from "@/lib/api";
import { AREAS, type AreaField, type AreaFormResponse } from "@/lib/areas";
import { cn } from "@/lib/utils";
import { useAuth } from "@/state/auth";
import { NotFoundPage } from "./NotFoundPage";

/**
 * Formular „Anlage“ eines Bereichs wie in GAPTEQ (füllt die nächste freie Zeile) und „Bearbeitung“ eines Eintrags
 * (mit itemId: vorbelegt, ID und Typ bleiben). Rechte Anlegen bzw. Bearbeiten aus den Rollen.
 */
export function AreaCreatePage() {
  const { id = "", itemId } = useParams();
  const editing = itemId !== undefined;
  const navigate = useNavigate();
  const back = (useLocation().state as { back?: { to: string; label: string } } | null)?.back;
  const { can } = useAuth();
  const area = Object.hasOwn(AREAS, id) ? AREAS[id] : undefined;
  const [form, setForm] = useState<AreaFormResponse | null>(null);
  const [values, setValues] = useState<Record<string, string>>({});
  // Werte beim Öffnen, damit der Dienst zwischenzeitliche Änderungen erkennt
  const [original, setOriginal] = useState<Record<string, string> | null>(null);
  const [missing, setMissing] = useState<string[]>([]);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const [showSecret, setShowSecret] = useState(false);

  useEffect(() => {
    if (!area?.createFields) return;
    const fail = (e: unknown) => setError(e instanceof Error ? e.message : String(e));
    if (editing) {
      api.areaRow(area.id, Number(itemId)).then((row) => {
        const current = Object.fromEntries(area.fields.map((f) => [f.key, String(row[f.key] ?? "")]));
        setOriginal(current);
        setValues(current);
      }, fail);
    } else setValues(Object.fromEntries(area.fields.filter((f) => f.defaultValue).map((f) => [f.key, f.defaultValue!])));
    api.areaForm(area.id).then(setForm, fail);
  }, [area, editing, itemId]);

  if (!area?.createFields) return <NotFoundPage />;
  if (!can(area.id, editing ? "edit" : "create")) return <p className="text-sm text-muted-foreground">Dafür fehlt die Berechtigung.</p>;
  // Passwortfeld (area.secret) steht nicht in fields, aber an seiner Stelle im Formular
  const secret = area.secret;
  const fields = area.createFields
    .map((key) => area.fields.find((f) => f.key === key) ?? (secret?.key === key ? ({ key, column: secret.column, label: secret.label } as AreaField) : undefined))
    .filter((f): f is AreaField => Boolean(f));
  const title = editing ? `Bearbeitung ${area.singular} ${itemId}` : (area.createTitle ?? `Anlage ${area.singular}`);
  const detail = `/bereich/${area.id}/${itemId}`;

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
      const payload = Object.fromEntries(fields.map((f) => [f.key, values[f.key] ?? ""]));
      if (editing && original) {
        const { changed } = await api.updateAreaRow(area.id, Number(itemId), payload, original);
        navigate(detail, { viewTransition: true, state: { saved: true, changed, back } });
      } else {
        const { id: newId } = await api.createAreaRow(area.id, payload);
        navigate(`/bereich/${area.id}/${newId}`, { viewTransition: true, state: { created: true } });
      }
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
        <Button type="submit" size="sm" disabled={busy || !form || (editing && !original)}>
          <Save aria-hidden />
          {busy ? "Wird gespeichert …" : "Speichern"}
        </Button>
        <Button variant="outline" size="sm" asChild>
          <Link to={editing ? detail : `/bereich/${area.id}`} viewTransition state={editing ? { back } : undefined}>
            <ArrowLeft aria-hidden />
            Zurück
          </Link>
        </Button>
      </div>
      {error && <p role="alert" className="rounded-md border border-destructive/30 bg-destructive/10 px-4 py-3 text-sm text-destructive">{error}</p>}
      <section className="animate-appear overflow-hidden rounded-lg border bg-card shadow-xs" aria-label={title}>
        <h1 className="bg-brand px-4 py-2.5 text-lg font-medium text-brand-foreground">{title}</h1>
        <div className="grid gap-x-6 gap-y-4 p-4 sm:grid-cols-2 2xl:grid-cols-3">
          {/* ID und Typ nur zur Anzeige, eigene Zeile über den Eingabefeldern */}
          <div className="flex flex-wrap gap-x-12 gap-y-3 sm:col-span-2 2xl:col-span-3">
            <div className="flex flex-col gap-1.5">
              <span className="text-xs text-muted-foreground">{editing ? "ID" : "ID (voraussichtlich)"}</span>
              <span className="text-sm tabular-nums" data-testid="next-id">{editing ? itemId : (form?.nextId ?? "…")}</span>
            </div>
            <div className="flex flex-col gap-1.5">
              <span className="text-xs text-muted-foreground">Typ</span>
              <span className="text-sm">{area.typeValue}</span>
            </div>
            {Object.entries(area.createFixed ?? {}).map(([key, value]) => (
              <div key={key} className="flex flex-col gap-1.5">
                <span className="text-xs text-muted-foreground">{area.fields.find((f) => f.key === key)?.label ?? key}</span>
                <span className="text-sm">{editing ? (original?.[key] ?? "…") : value}</span>
              </div>
            ))}
          </div>
          {fields.map((f) => {
            const invalid = missing.includes(f.key);
            // Beim Bearbeiten bleibt ein alter Wert wählbar, auch wenn er nicht mehr in der Liste steht
            const listed = form?.options[f.key];
            const old = original?.[f.key];
            const options = listed && old && !listed.includes(old) ? [old, ...listed] : listed;
            const common = { id: `f-${f.key}`, "aria-invalid": invalid || undefined, "aria-required": f.required || undefined };
            return (
              <div key={f.key} className="flex flex-col gap-1.5">
                <Label htmlFor={`f-${f.key}`} className={cn(invalid && "text-destructive")}>
                  {f.formLabel ?? f.label}
                  {f.required && <span className="text-destructive"> *</span>}
                </Label>
                {f.key === secret?.key ? (
                  <div className="relative">
                    <Input
                      {...common}
                      type={showSecret ? "text" : "password"}
                      autoComplete="new-password"
                      maxLength={255}
                      className="pr-10 font-mono"
                      placeholder={editing ? "Leer lassen = unverändert" : ""}
                      value={values[f.key] ?? ""}
                      onChange={(e) => set(f.key, e.target.value)}
                    />
                    <button
                      type="button"
                      onClick={() => setShowSecret((s) => !s)}
                      aria-label={showSecret ? `${f.label} verbergen` : `${f.label} anzeigen`}
                      className="absolute top-1/2 right-1 flex size-7 -translate-y-1/2 items-center justify-center rounded text-muted-foreground hover:bg-accent hover:text-foreground"
                    >
                      {showSecret ? <EyeOff className="size-4" aria-hidden /> : <Eye className="size-4" aria-hidden />}
                    </button>
                  </div>
                ) : f.options ? (
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
          {editing
            ? `Gespeichert wird in dbo.${area.table}, ID ${itemId}. Hat jemand den Eintrag inzwischen geändert (auch in GAPTEQ), speichert die CMDB nicht und meldet das.`
            : `Gespeichert wird in die nächste freie Zeile von dbo.${area.table}, wie in GAPTEQ. Die ID kann sich ändern, wenn gleichzeitig jemand anderes anlegt.`}
        </p>
      </section>
    </form>
  );
}
