import { useState, type FormEvent } from "react";
import { Database, LogIn } from "lucide-react";
import { Navigate, useLocation } from "react-router";
import { TestBanner } from "@/components/layout/TestBanner";
import { Button } from "@/components/ui/button";
import { Card, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { BRANDING, BrandLogo, brandingUrl } from "@/components/Branding";
import { useAuth } from "@/state/auth";

const REMEMBER_KEY = "cmdb-angemeldet-bleiben";

function readRemembered(): string {
  try {
    return localStorage.getItem(REMEMBER_KEY) ?? "";
  } catch {
    return "";
  }
}

export function LoginPage() {
  const { user, testMode, login } = useAuth();
  const location = useLocation();
  // Benutzername vom letzten „Angemeldet bleiben“ vorbelegen (nie das Passwort)
  const [username, setUsername] = useState(() => readRemembered());
  const [remember, setRemember] = useState(() => readRemembered() !== "");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);

  if (user) {
    const from = (location.state as { from?: string } | null)?.from;
    return <Navigate to={from && from !== "/login" ? from : "/"} replace />;
  }

  async function submit(e: FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError("");
    try {
      await login(username, password, remember);
      try {
        if (remember) localStorage.setItem(REMEMBER_KEY, username.trim());
        else localStorage.removeItem(REMEMBER_KEY);
      } catch {
        /* ohne Speicher wird nur der Name nicht vorbelegt */
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : "Anmeldung fehlgeschlagen.");
      setPassword("");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="flex min-h-svh flex-col">
      {testMode && <TestBanner />}
      {/* Anmeldebild (falls vorhanden) mit blauem Verlauf, damit das Formular gut lesbar bleibt */}
      <main
        className="relative flex flex-1 items-center justify-center bg-muted bg-cover bg-center p-4"
        style={BRANDING ? { backgroundImage: `url(${brandingUrl("anmeldung.jpg")})` } : undefined}
      >
        {BRANDING && <div className="absolute inset-0 bg-gradient-to-br from-brand/75 via-brand/40 to-black/50" aria-hidden />}
        <Card className="animate-appear relative w-full max-w-sm shadow-xl">
          <CardHeader>
            <div className="mb-3 flex items-center justify-between gap-3">
              <BrandLogo variant="dunkel" className="h-12 w-auto" fallback={<Database className="size-6 text-muted-foreground" aria-hidden />} />
              <span className="text-sm font-semibold tracking-wide text-brand">CMDB</span>
            </div>
            <CardTitle>Anmelden</CardTitle>
            <CardDescription>{testMode ? "Testbenutzer „admin“ oder „user“, Passwort „test“." : "Mit dem Windows-Konto (ohne Domäne)."}</CardDescription>
          </CardHeader>
          <form onSubmit={submit} className="flex flex-col gap-4">
            <div className="flex flex-col gap-2">
              <Label htmlFor="username">Benutzername</Label>
              <Input id="username" name="username" autoComplete="username" autoCapitalize="none" spellCheck={false} required value={username} onChange={(e) => setUsername(e.target.value)} autoFocus={!username} />
            </div>
            <div className="flex flex-col gap-2">
              <Label htmlFor="password">Passwort</Label>
              <Input id="password" name="password" type="password" autoComplete="current-password" required value={password} onChange={(e) => setPassword(e.target.value)} autoFocus={Boolean(username)} />
            </div>
            {error && (
              <p role="alert" className="text-sm text-destructive">
                {error}
              </p>
            )}
            <label className="flex cursor-pointer items-center gap-2 text-sm">
              <input type="checkbox" className="size-4 accent-[var(--brand)]" checked={remember} onChange={(e) => setRemember(e.target.checked)} />
              Angemeldet bleiben
            </label>
            <Button type="submit" disabled={busy}>
              <LogIn aria-hidden />
              {busy ? "Wird geprüft …" : "Anmelden"}
            </Button>
          </form>
        </Card>
      </main>
    </div>
  );
}
