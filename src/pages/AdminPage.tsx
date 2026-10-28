import { useCallback, useEffect, useState } from "react";
import { CheckCircle2, FilePlus2, RefreshCw, XCircle } from "lucide-react";
import { Link } from "react-router";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { api } from "@/lib/api";
import type { CheckResult, HealthResponse } from "@/lib/types";

function StatusCard({ title, testId, result, index }: { title: string; testId: string; result: CheckResult; index: number }) {
  return (
    <Card data-testid={testId} className="animate-appear" style={{ "--i": index } as React.CSSProperties}>
      <CardHeader>
        <div className="flex items-center justify-between gap-2">
          <CardTitle>{title}</CardTitle>
          <Badge variant={result.ok ? "success" : "destructive"}>
            {result.ok ? <CheckCircle2 className="size-3.5" aria-hidden /> : <XCircle className="size-3.5" aria-hidden />}
            {result.ok ? "Verbunden" : "Fehler"}
          </Badge>
        </div>
        <CardDescription className="break-all font-mono text-xs">{result.target}</CardDescription>
      </CardHeader>
      <dl className="grid grid-cols-[auto_1fr] gap-x-4 gap-y-1 text-sm">
        {result.detail && (<><dt className="text-muted-foreground">Details</dt><dd className="break-words">{result.detail}</dd></>)}
        {result.error && (<><dt className="text-muted-foreground">Fehler</dt><dd className="break-words text-destructive">{result.error}</dd></>)}
        {result.latencyMs !== undefined && (<><dt className="text-muted-foreground">Dauer</dt><dd className="tabular-nums">{result.latencyMs} ms</dd></>)}
      </dl>
    </Card>
  );
}

/** Nur für admin: Zustand von LDAP und Datenbank */
export function AdminPage() {
  const [health, setHealth] = useState<HealthResponse | null>(null);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);

  const load = useCallback(() => {
    setBusy(true);
    setError("");
    api.health().then(setHealth, (e: unknown) => setError(e instanceof Error ? e.message : String(e))).finally(() => setBusy(false));
  }, []);

  useEffect(load, [load]);

  return (
    <div className="flex flex-col gap-6 mx-auto w-full max-w-6xl">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="text-2xl font-semibold">Verwaltung</h1>
          <p className="text-sm text-muted-foreground">Status der Anbindungen{health ? ` · Version ${health.version}` : ""}</p>
        </div>
        <Button variant="outline" size="sm" onClick={load} disabled={busy}>
          <RefreshCw className={busy ? "animate-spin" : undefined} aria-hidden />
          Neu prüfen
        </Button>
      </div>
      {error && <p role="alert" className="text-sm text-destructive">{error}</p>}
      {health?.details && (
        <div className="grid gap-4 md:grid-cols-2">
          <StatusCard title="LDAP (Active Directory)" testId="status-ldap" result={health.details.ldap} index={0} />
          <StatusCard title="Datenbank (SQL Server)" testId="status-db" result={health.details.db} index={1} />
        </div>
      )}
      {health && !health.details && !busy && <p className="text-sm text-muted-foreground">Keine Details verfügbar.</p>}
      <Card className="animate-appear" style={{ "--i": 2 } as React.CSSProperties}>
        <CardHeader>
          <CardTitle>Anlage / Bearbeitung</CardTitle>
          <CardDescription>Neue Einträge wie in GAPTEQ, gespeichert in die nächste freie Zeile.</CardDescription>
        </CardHeader>
        <Button size="sm" className="self-start" asChild>
          <Link to="/anlage-vertrag" viewTransition>
            <FilePlus2 aria-hidden />
            Anlage Vertrag
          </Link>
        </Button>
      </Card>
    </div>
  );
}
