import { useState, type FormEvent } from "react";
import { Database, LogIn } from "lucide-react";
import { Navigate, useLocation } from "react-router";
import { TestBanner } from "@/components/layout/TestBanner";
import { Button } from "@/components/ui/button";
import { Card, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useAuth } from "@/state/auth";

export function LoginPage() {
  const { user, testMode, login } = useAuth();
  const location = useLocation();
  const [username, setUsername] = useState("");
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
      await login(username, password);
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
      <main className="flex flex-1 items-center justify-center p-4">
        <Card className="animate-appear w-full max-w-sm">
          <CardHeader>
            <div className="mb-2 flex items-center gap-2 text-muted-foreground">
              <Database className="size-5" aria-hidden />
              <span className="text-sm font-medium">CMDB</span>
            </div>
            <CardTitle>Anmelden</CardTitle>
            <CardDescription>{testMode ? "Testbenutzer „admin“ oder „user“, Passwort „test“." : "Mit dem Windows-Konto (ohne Domäne)."}</CardDescription>
          </CardHeader>
          <form onSubmit={submit} className="flex flex-col gap-4">
            <div className="flex flex-col gap-2">
              <Label htmlFor="username">Benutzername</Label>
              <Input id="username" name="username" autoComplete="username" autoCapitalize="none" spellCheck={false} required value={username} onChange={(e) => setUsername(e.target.value)} autoFocus />
            </div>
            <div className="flex flex-col gap-2">
              <Label htmlFor="password">Passwort</Label>
              <Input id="password" name="password" type="password" autoComplete="current-password" required value={password} onChange={(e) => setPassword(e.target.value)} />
            </div>
            {error && (
              <p role="alert" className="text-sm text-destructive">
                {error}
              </p>
            )}
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
