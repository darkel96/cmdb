import { useEffect, useState, type FormEvent } from "react";
import { ArrowLeft, Save, Trash2 } from "lucide-react";
import { Link, useNavigate, useParams } from "react-router";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { api } from "@/lib/api";
import { cn } from "@/lib/utils";
import { useAuth } from "@/state/auth";

type Values = { name: string; country: string; city: string; zip: string; address: string; email: string };

type Field = { key: keyof Values; label: string; required?: boolean; type?: string };

const CREATE_FIELDS: Field[] = [
  { key: "name", label: "Kunde", required: true },
  { key: "country", label: "Land" },
  { key: "city", label: "Stadt" },
];

const EDIT_FIELDS: Field[] = [
  ...CREATE_FIELDS,
  { key: "zip", label: "PLZ" },
  { key: "address", label: "Adresse" },
  { key: "email", label: "E-Mail", type: "email" },
];

/** „Anlage Kunde“ (ohne customerId) und „Bearbeitung Kunde“ wie in GAPTEQ, nur für Admins */
export function CustomerFormPage() {
  const { customerId } = useParams();
  const editing = customerId !== undefined;
  const navigate = useNavigate();
  const { can } = useAuth();
  const allowedHere = editing ? can("kunden", "edit") || can("kunden", "delete") : can("kunden", "create");
  const [values, setValues] = useState<Values>({ name: "", country: "", city: "", zip: "", address: "", email: "" });
  const [loaded, setLoaded] = useState(!editing);
  const [error, setError] = useState("");
  const [missing, setMissing] = useState(false);
  const [busy, setBusy] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [originalName, setOriginalName] = useState("");

  useEffect(() => {
    if (!editing) return;
    api.customer(Number(customerId)).then(
      ({ customer }) => {
        setValues({ name: customer.name, country: customer.country, city: customer.city, zip: customer.zip, address: customer.address, email: customer.email });
        setOriginalName(customer.name);
        setLoaded(true);
      },
      (e: unknown) => setError(e instanceof Error ? e.message : String(e)),
    );
  }, [editing, customerId]);

  const back = editing ? `/kunden/${customerId}` : "/";
  const fields = editing ? EDIT_FIELDS : CREATE_FIELDS;

  async function save(e: FormEvent) {
    e.preventDefault();
    if (!values.name.trim()) {
      setMissing(true);
      setError("Bitte den Kunden angeben.");
      return;
    }
    setBusy(true);
    setError("");
    try {
      if (editing) {
        const result = await api.updateCustomer(Number(customerId), values);
        navigate(`/kunden/${customerId}`, { viewTransition: true, state: { saved: true, renamed: result.renamed } });
      } else {
        const result = await api.createCustomer({ name: values.name, country: values.country, city: values.city });
        navigate(`/kunden/${result.id}`, { viewTransition: true, state: { created: true } });
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setBusy(false);
    }
  }

  async function remove() {
    setBusy(true);
    setError("");
    try {
      await api.deleteCustomer(Number(customerId));
      navigate("/", { viewTransition: true, state: { deleted: originalName } });
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
      setConfirmDelete(false);
    } finally {
      setBusy(false);
    }
  }

  const renaming = editing && loaded && values.name.trim() !== originalName;

  if (!allowedHere) return <p className="text-sm text-muted-foreground">Dafür fehlt die Berechtigung.</p>;

  return (
    <form onSubmit={save} noValidate className="flex w-full flex-col gap-3">
      <div className="flex items-center justify-between gap-2">
        <Button type="submit" size="sm" disabled={busy || !loaded || (editing && !can("kunden", "edit"))}>
          <Save aria-hidden />
          {busy ? "Wird gespeichert …" : "Speichern"}
        </Button>
        <div className="flex items-center gap-2">
          {editing && !confirmDelete && can("kunden", "delete") && (
            <Button type="button" variant="outline" size="sm" className="text-destructive hover:bg-destructive/10 hover:text-destructive" disabled={busy || !loaded} onClick={() => setConfirmDelete(true)}>
              <Trash2 aria-hidden />
              Löschen
            </Button>
          )}
          <Button variant="outline" size="sm" asChild>
            <Link to={back} viewTransition>
              <ArrowLeft aria-hidden />
              Zurück
            </Link>
          </Button>
        </div>
      </div>
      {confirmDelete && (
        <div role="alertdialog" aria-label="Kunde löschen" className="animate-fade-in flex flex-wrap items-center justify-between gap-3 rounded-md border border-destructive/30 bg-destructive/10 px-4 py-3 text-sm">
          <span>Kunde „{originalName}“ wirklich löschen? Das geht nur, wenn ihm keine Systeme und Dokumente mehr zugeordnet sind.</span>
          <span className="flex gap-2">
            <Button type="button" size="sm" className="bg-destructive hover:bg-destructive/90" disabled={busy} onClick={() => void remove()}>
              Ja, löschen
            </Button>
            <Button type="button" variant="outline" size="sm" onClick={() => setConfirmDelete(false)}>
              Abbrechen
            </Button>
          </span>
        </div>
      )}
      {error && <p role="alert" className="rounded-md border border-destructive/30 bg-destructive/10 px-4 py-3 text-sm text-destructive">{error}</p>}
      <section className="animate-appear overflow-hidden rounded-lg border bg-card shadow-xs" aria-label={editing ? "Bearbeitung Kunde" : "Anlage Kunde"}>
        <h1 className="bg-brand px-4 py-2.5 text-lg font-medium text-brand-foreground">{editing ? "Bearbeitung Kunde" : "Anlage Kunde"}</h1>
        <div className="grid gap-x-6 gap-y-4 p-4 sm:grid-cols-2 2xl:grid-cols-3">
          {fields.map((f) => {
            const invalid = f.key === "name" && missing && !values.name.trim();
            return (
              <div key={f.key} className="flex flex-col gap-1.5">
                <Label htmlFor={`k-${f.key}`} className={cn(invalid && "text-destructive")}>
                  {f.label}
                  {f.required && <span className="text-destructive"> *</span>}
                </Label>
                <Input
                  id={`k-${f.key}`}
                  type={f.type ?? "text"}
                  value={values[f.key]}
                  maxLength={f.key === "name" ? 100 : 255}
                  aria-invalid={invalid || undefined}
                  aria-required={f.required || undefined}
                  className={cn(invalid && "border-destructive")}
                  disabled={!loaded}
                  onChange={(e) => setValues((v) => ({ ...v, [f.key]: e.target.value }))}
                />
              </div>
            );
          })}
        </div>
        {renaming && (
          <p role="note" className="border-t bg-accent/60 px-4 py-2 text-xs">
            Der Name ändert sich. Beim Speichern wird er auch bei allen Systemen, Dokumenten, Kontakten und Verträgen dieses Kunden mitgeändert.
          </p>
        )}
      </section>
    </form>
  );
}
