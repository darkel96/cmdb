import { useState } from "react";
import { CheckCircle2, Eye, EyeOff, Mail, Pencil, PlugZap, RotateCcw, Save, Trash2, Undo2, XCircle } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Combobox } from "@/components/ui/combobox";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { api } from "@/lib/api";
import type { SettingsResponse, SettingsSection, SettingsSectionView } from "@/lib/settings";
import type { CheckResult } from "@/lib/types";
import { cn } from "@/lib/utils";
import { useAuth } from "@/state/auth";

function ResultLines({ result }: { result: CheckResult }) {
  return (
    <dl className="grid grid-cols-[auto_1fr] gap-x-4 gap-y-1 text-sm">
      <dt className="text-muted-foreground">Ziel</dt>
      <dd className="break-all font-mono text-xs leading-5">{result.target}</dd>
      {result.detail && (<><dt className="text-muted-foreground">Details</dt><dd className="break-words">{result.detail}</dd></>)}
      {result.error && (<><dt className="text-muted-foreground">Fehler</dt><dd className="break-words text-destructive">{result.error}</dd></>)}
      {result.latencyMs !== undefined && (<><dt className="text-muted-foreground">Dauer</dt><dd className="tabular-nums">{result.latencyMs} ms</dd></>)}
    </dl>
  );
}

/**
 * Eine Anbindung (LDAP, Datenbank, SMTP) unter Verwaltung › Status: Zustand, und für Admins bearbeiten. Neue Werte
 * lassen sich vorher testen; LDAP und Datenbank speichert der Dienst nur, wenn der Test klappt.
 */
export function SettingsCard({
  section,
  view,
  status,
  index,
  onSaved,
}: {
  section: SettingsSection;
  view: SettingsSectionView | undefined;
  status: CheckResult | undefined;
  index: number;
  onSaved: (next: SettingsResponse) => void;
}) {
  const { user } = useAuth();
  const [editing, setEditing] = useState(false);
  const [values, setValues] = useState<Record<string, string>>({});
  const [password, setPassword] = useState("");
  const [clearPassword, setClearPassword] = useState(false);
  const [showPassword, setShowPassword] = useState(false);
  const [check, setCheck] = useState<CheckResult | null>(null);
  const [busy, setBusy] = useState<"" | "test" | "save" | "reset" | "mail">("");
  const [message, setMessage] = useState<{ ok: boolean; text: string } | null>(null);
  const [mailTo, setMailTo] = useState(user?.mail ?? "");

  const start = () => {
    setValues(Object.fromEntries(section.fields.map((f) => [f.key, String(view?.values[f.key] ?? "")])));
    setPassword("");
    setClearPassword(false);
    setShowPassword(false);
    setCheck(null);
    setMessage(null);
    setEditing(true);
  };

  const input = () => ({
    values: Object.fromEntries(section.fields.map((f) => [f.key, f.type === "number" ? Number(values[f.key]) : (values[f.key] ?? "").trim()])),
    ...(clearPassword ? { password: "" } : password ? { password } : {}),
  });

  async function run(kind: "test" | "save" | "reset") {
    setBusy(kind);
    setMessage(null);
    try {
      if (kind === "test") {
        const result = await api.testSettings(section.id, input());
        setCheck(result);
      } else if (kind === "save") {
        const result = await api.saveSettings(section.id, input());
        setCheck(result.check);
        setEditing(false);
        onSaved(result);
        setMessage({ ok: true, text: "Gespeichert und wirksam." });
      } else {
        const result = await api.resetSettings(section.id);
        setEditing(false);
        onSaved(result);
        setMessage({ ok: true, text: "Zurück auf die Werte aus der .env." });
      }
    } catch (e) {
      setMessage({ ok: false, text: e instanceof Error ? e.message : String(e) });
    } finally {
      setBusy("");
    }
  }

  async function sendTestMail() {
    setBusy("mail");
    setMessage(null);
    try {
      const r = await api.testMail(mailTo.trim());
      setMessage({ ok: true, text: r.testMode ? `Testmodus: an ${mailTo.trim()} wäre jetzt eine Test-Mail gegangen.` : `Test-Mail an ${mailTo.trim()} gesendet.` });
    } catch (e) {
      setMessage({ ok: false, text: e instanceof Error ? e.message : String(e) });
    } finally {
      setBusy("");
    }
  }

  const notConfigured = section.id === "smtp" && !view?.values.host;
  const badge = !status ? null : status.ok ? (
    <Badge variant="success"><CheckCircle2 className="size-3.5" aria-hidden />Verbunden</Badge>
  ) : notConfigured ? (
    <Badge variant="secondary">Nicht eingerichtet</Badge>
  ) : (
    <Badge variant="destructive"><XCircle className="size-3.5" aria-hidden />Fehler</Badge>
  );

  return (
    <section
      data-testid={`status-${section.id}`}
      aria-label={section.title}
      className="animate-appear flex flex-col gap-3 rounded-lg border bg-card p-5 shadow-xs"
      style={{ "--i": index } as React.CSSProperties}
    >
      <div className="flex items-center justify-between gap-2">
        <h2 className="font-semibold">{section.title}</h2>
        {badge}
      </div>

      {!editing && (
        <>
          {status ? <ResultLines result={status} /> : <p className="text-sm text-muted-foreground">Wird geprüft …</p>}
          {view && view.changed.length > 0 && (
            <p className="text-xs text-muted-foreground">
              In der Verwaltung geändert: {view.changed.map((k) => (k === "password" ? "Passwort" : (section.fields.find((f) => f.key === k)?.label ?? k))).join(", ")}. Übrige Werte aus der .env.
            </p>
          )}
          {view?.passwordUnreadable && <p className="text-xs text-destructive">Das gespeicherte Passwort lässt sich nicht mehr entschlüsseln (Schlüssel geändert); bitte neu eingeben.</p>}
          <div className="mt-auto flex flex-wrap gap-2 pt-1">
            <Button size="sm" variant="outline" onClick={start} disabled={!view}>
              <Pencil aria-hidden />
              Bearbeiten
            </Button>
            {view && view.changed.length > 0 && (
              <Button size="sm" variant="ghost" onClick={() => void run("reset")} disabled={busy !== ""} title="Änderungen aus der Verwaltung verwerfen">
                <RotateCcw aria-hidden />
                Auf .env zurücksetzen
              </Button>
            )}
          </div>
          {section.id === "smtp" && view?.values.host && (
            <div className="flex flex-wrap items-end gap-2 border-t pt-3">
              <div className="flex min-w-48 flex-1 flex-col gap-1.5">
                <Label htmlFor="testmail-to">Test-Mail an</Label>
                <Input id="testmail-to" type="email" value={mailTo} onChange={(e) => setMailTo(e.target.value)} placeholder="name@example.loc" />
              </div>
              <Button size="sm" variant="outline" onClick={() => void sendTestMail()} disabled={busy !== "" || !mailTo.trim()}>
                <Mail aria-hidden />
                {busy === "mail" ? "Wird gesendet …" : "Test-Mail senden"}
              </Button>
            </div>
          )}
        </>
      )}

      {editing && (
        <form
          className="flex flex-col gap-3"
          onSubmit={(e) => {
            e.preventDefault();
            void run("save");
          }}
        >
          <div className="grid gap-3 sm:grid-cols-2">
            {section.fields.map((f) => (
              <div key={f.key} className={cn("flex flex-col gap-1.5", (f.key === "url" || f.key === "baseDn") && "sm:col-span-2")}>
                <Label htmlFor={`${section.id}-${f.key}`}>
                  {f.label}
                  {f.required && <span className="text-destructive"> *</span>}
                </Label>
                {f.type === "select" ? (
                  <Combobox
                    id={`${section.id}-${f.key}`}
                    value={f.options?.find((o) => o.value === values[f.key])?.label ?? ""}
                    options={f.options?.map((o) => o.label) ?? []}
                    clearable={false}
                    onChange={(label) => setValues((v) => ({ ...v, [f.key]: f.options?.find((o) => o.label === label)?.value ?? "" }))}
                  />
                ) : (
                  <Input
                    id={`${section.id}-${f.key}`}
                    type={f.type === "number" ? "number" : "text"}
                    value={values[f.key] ?? ""}
                    placeholder={f.placeholder}
                    maxLength={255}
                    onChange={(e) => setValues((v) => ({ ...v, [f.key]: e.target.value }))}
                  />
                )}
                {f.help && <span className="text-xs text-muted-foreground">{f.help}</span>}
              </div>
            ))}
            {section.password && (
              <div className="flex flex-col gap-1.5 sm:col-span-2">
                <Label htmlFor={`${section.id}-password`}>Passwort</Label>
                <div className="flex gap-2">
                  <div className="relative flex-1">
                    <Input
                      id={`${section.id}-password`}
                      type={showPassword ? "text" : "password"}
                      autoComplete="new-password"
                      maxLength={255}
                      className="pr-10 font-mono"
                      disabled={clearPassword}
                      value={clearPassword ? "" : password}
                      placeholder={clearPassword ? "Wird beim Speichern entfernt" : view?.passwordSet ? "Leer lassen = unverändert" : "Kein Passwort gesetzt"}
                      onChange={(e) => setPassword(e.target.value)}
                    />
                    <button
                      type="button"
                      onClick={() => setShowPassword((s) => !s)}
                      aria-label={showPassword ? "Passwort verbergen" : "Passwort anzeigen"}
                      className="absolute top-1/2 right-1 flex size-7 -translate-y-1/2 items-center justify-center rounded text-muted-foreground hover:bg-accent hover:text-foreground"
                    >
                      {showPassword ? <EyeOff className="size-4" aria-hidden /> : <Eye className="size-4" aria-hidden />}
                    </button>
                  </div>
                  {/* Die Datenbank braucht ein Passwort; entfernen nur beim Mailserver (z. B. Relay ohne Anmeldung) */}
                  {section.id === "smtp" && view?.passwordSet && (
                    <Button type="button" variant="outline" onClick={() => { setClearPassword((c) => !c); setPassword(""); }}>
                      {clearPassword ? <Undo2 aria-hidden /> : <Trash2 aria-hidden />}
                      {clearPassword ? "Rückgängig" : "Entfernen"}
                    </Button>
                  )}
                </div>
              </div>
            )}
          </div>
          {check && (
            <div className={cn("rounded-md border px-3 py-2", check.ok ? "border-success/30 bg-success/10" : "border-destructive/30 bg-destructive/10")} role="status">
              <p className={cn("mb-1 text-sm font-medium", check.ok ? "text-success" : "text-destructive")}>{check.ok ? "Verbindung klappt." : "Verbindung klappt nicht."}</p>
              <ResultLines result={check} />
            </div>
          )}
          {section.testRequired && <p className="text-xs text-muted-foreground">Gespeichert wird nur, wenn die Verbindung mit den neuen Werten klappt.</p>}
          <div className="flex flex-wrap gap-2">
            <Button type="button" size="sm" variant="outline" onClick={() => void run("test")} disabled={busy !== ""}>
              <PlugZap aria-hidden />
              {busy === "test" ? "Wird getestet …" : "Verbindung testen"}
            </Button>
            <Button type="submit" size="sm" disabled={busy !== ""}>
              <Save aria-hidden />
              {busy === "save" ? "Wird gespeichert …" : "Speichern"}
            </Button>
            <Button type="button" size="sm" variant="ghost" onClick={() => setEditing(false)} disabled={busy !== ""}>
              Abbrechen
            </Button>
          </div>
        </form>
      )}
      {message && (
        <p role={message.ok ? "status" : "alert"} className={cn("text-sm", message.ok ? "text-success" : "text-destructive")}>
          {message.text}
        </p>
      )}
    </section>
  );
}
