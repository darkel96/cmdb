import { useCallback, useEffect, useState } from "react";
import { CheckCircle2, RefreshCw, XCircle } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { api } from "@/lib/api";
import type { CheckResult, HealthResponse } from "@/lib/types";
import { Navigate, useSearchParams } from "react-router";
import { visibleAdminTabs } from "@/lib/adminTabs";
import { useAuth } from "@/state/auth";
import { ContractTypesPage } from "./ContractTypesPage";
import { StammdatenPage } from "./StammdatenPage";
import { cn } from "@/lib/utils";
import { LoginsTab } from "./admin/LoginsTab";
import { RolesTab } from "./admin/RolesTab";

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

/** Reiter Status: Zustand von LDAP und Datenbank */
function StatusTab() {
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
    <div className="flex flex-col gap-6">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <p className="text-sm text-muted-foreground">Status der Anbindungen{health ? ` · Version ${health.version}` : ""}</p>
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
    </div>
  );
}

/**
 * Verwaltung: Anlage Vertrag und Stammdaten für alle mit dem Recht dazu, Status, Anmelde-Protokoll und Rollen nur für
 * Admins. Ohne einen einzigen erlaubten Reiter geht es zurück zur Startseite.
 */
export function AdminPage() {
  const [params, setParams] = useSearchParams();
  const { user, can } = useAuth();
  const tabs = visibleAdminTabs(user?.role === "admin", can);
  if (!tabs.length) return <Navigate to="/" replace />;
  const tab = tabs.find((t) => t.id === params.get("tab"))?.id ?? tabs[0].id;
  return (
    <div className="flex w-full flex-col gap-4">
      <h1 className="text-2xl font-semibold">Verwaltung</h1>
      <div role="tablist" aria-label="Verwaltung" className="flex gap-1 border-b">
        {tabs.map((t) => (
          <button
            key={t.id}
            type="button"
            role="tab"
            aria-selected={tab === t.id}
            onClick={() => setParams(t.id === tabs[0].id ? {} : { tab: t.id })}
            className={cn(
              "-mb-px border-b-2 px-4 py-2 text-sm font-medium transition-colors duration-150",
              tab === t.id ? "border-brand text-brand" : "border-transparent text-muted-foreground hover:text-foreground",
            )}
          >
            {t.label}
          </button>
        ))}
      </div>
      <div role="tabpanel" className="flex min-h-0 flex-1 flex-col">
        {tab === "anlage-vertrag" && <ContractTypesPage />}
        {tab === "stammdaten" && <StammdatenPage />}
        {tab === "status" && <StatusTab />}
        {tab === "anmeldungen" && <LoginsTab />}
        {tab === "rollen" && <RolesTab />}
      </div>
    </div>
  );
}
