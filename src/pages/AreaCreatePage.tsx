import { useEffect, useState, type FormEvent } from "react";
import { ArrowLeft, Eye, EyeOff, Save, Trash2, Undo2 } from "lucide-react";
import { Link, useLocation, useNavigate, useParams } from "react-router";
import { Button } from "@/components/ui/button";
import { Combobox } from "@/components/ui/combobox";
import { DateInput } from "@/components/ui/date-input";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { api } from "@/lib/api";
import { AREAS, editableFields, type AreaField, type AreaFormResponse } from "@/lib/areas";
import { longDate } from "@/lib/format";
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
  // Beim Bearbeiten: vorhandenes Passwort beim Speichern entfernen
  const [clearSecret, setClearSecret] = useState(false);

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
  // Beim Bearbeiten: Felder mit Recht (ganzer Bereich oder Feldgruppe, z. B. Oracle-ESL › Einkauf); übrige nur angezeigt
  const editable = editing ? editableFields(area, can) : area.createFields;
  if (editing ? !editable.length : !can(area.id, "create")) return <p className="text-sm text-muted-foreground">Dafür fehlt die Berechtigung.</p>;
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
    const empty = fields.filter((f) => f.required && editable.includes(f.key) && !values[f.key]?.trim()).map((f) => f.key);
    setMissing(empty);
    if (empty.length) {
      setError("Bitte alle Pflichtfelder (*) ausfüllen.");
      return;
    }
    setBusy(true);
    setError("");
    try {
      const payload = Object.fromEntries(fields.filter((f) => editable.includes(f.key)).map((f) => [f.key, values[f.key] ?? ""]));
      if (editing && original) {
        const { changed } = await api.updateAreaRow(area.id, Number(itemId), payload, original, clearSecret);
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

  const renderField = (f: AreaField) => {
    // Ohne Recht für dieses Feld (Feldgruppe) bzw. nur beim Anlegen änderbar: Wert nur anzeigen
    if (!editable.includes(f.key)) {
      const value = values[f.key] ?? "";
      return (
        <div key={f.key} className="flex flex-col gap-1.5">
          <span className="text-sm font-medium text-muted-foreground">{f.formLabel ?? f.label}</span>
          <span className="flex min-h-9 items-center rounded-md border border-dashed px-3 text-sm text-muted-foreground" aria-label={f.formLabel ?? f.label}>
            {(f.date ? longDate(value) : value) || "–"}
          </span>
        </div>
      );
    }
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
          <div className="flex gap-2">
          <div className="relative flex-1">
            <Input
              {...common}
              type={showSecret ? "text" : "password"}
              autoComplete="new-password"
              maxLength={255}
              className="pr-10 font-mono"
              disabled={clearSecret}
              placeholder={clearSecret ? "Wird beim Speichern entfernt" : editing ? "Leer lassen = unverändert" : ""}
              value={clearSecret ? "" : (values[f.key] ?? "")}
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
          {editing && (
            <Button
              type="button"
              variant="outline"
              onClick={() => {
                setClearSecret((c) => !c);
                set(f.key, "");
              }}
              title={clearSecret ? "Doch nicht entfernen" : `${f.label} beim Speichern entfernen`}
            >
              {clearSecret ? <Undo2 aria-hidden /> : <Trash2 aria-hidden />}
              {clearSecret ? "Rückgängig" : "Entfernen"}
            </Button>
          )}
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
          f.date ? (
            <DateInput id={`f-${f.key}`} aria-required={f.required || undefined} invalid={invalid} value={values[f.key] ?? ""} onChange={(v) => set(f.key, v)} />
          ) : (
            <Input {...common} type="text" maxLength={255} className={cn(invalid && "border-destructive")} value={values[f.key] ?? ""} onChange={(e) => set(f.key, e.target.value)} />
          )
        )}
      </div>
    );
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
          {area.formSections ? (
            area.formSections.map((section) => (
              <fieldset key={section.label} className="grid gap-x-6 gap-y-4 sm:col-span-2 sm:grid-cols-2 2xl:col-span-3 2xl:grid-cols-3">
                <legend className="mb-3 w-full border-b pb-1 text-sm font-semibold text-brand">{section.label}</legend>
                {section.fields.map((key) => fields.find((f) => f.key === key)).filter((f): f is AreaField => Boolean(f)).map(renderField)}
              </fieldset>
            ))
          ) : (
            fields.map(renderField)
          )}
        </div>
        <p className="border-t px-4 py-2 text-xs text-muted-foreground">
          {editing
            ? `Gespeichert wird in ${area.schema ?? "dbo"}.${area.table}, ID ${itemId}. Hat jemand den Eintrag inzwischen geändert${area.schema === "cmdb" ? "" : " (auch in GAPTEQ)"}, speichert die CMDB nicht und meldet das.`
            : area.identity
              ? `Gespeichert wird in ${area.schema ?? "dbo"}.${area.table}; die Datenbank vergibt die nächste Nummer. Die ID kann sich ändern, wenn gleichzeitig jemand anderes anlegt.`
              : `Gespeichert wird in die nächste freie Zeile von dbo.${area.table}, wie in GAPTEQ. Die ID kann sich ändern, wenn gleichzeitig jemand anderes anlegt.`}
        </p>
      </section>
    </form>
  );
}
