import { useCallback, useEffect, useState } from "react";
import { RefreshCw } from "lucide-react";
import { Button } from "@/components/ui/button";
import { api } from "@/lib/api";
import type { HealthResponse } from "@/lib/types";
import { SETTINGS_SECTIONS, type SettingsResponse } from "@/lib/settings";
import { Navigate, useSearchParams } from "react-router";
import { visibleAdminTabs } from "@/lib/adminTabs";
import { useAuth } from "@/state/auth";
import { ContractTypesPage } from "./ContractTypesPage";
import { StammdatenPage } from "./StammdatenPage";
import { cn } from "@/lib/utils";
import { LoginsTab } from "./admin/LoginsTab";
import { RolesTab } from "./admin/RolesTab";
import { SettingsCard } from "./admin/SettingsCard";

/** Reiter Status: Zustand von LDAP, Datenbank und SMTP; jede Anbindung lässt sich bearbeiten */
function StatusTab() {
  const [health, setHealth] = useState<HealthResponse | null>(null);
  const [current, setCurrent] = useState<SettingsResponse | null>(null);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);

  const load = useCallback(() => {
    setBusy(true);
    setError("");
    const fail = (e: unknown) => setError(e instanceof Error ? e.message : String(e));
    api.settings().then(setCurrent, fail);
    api.health().then(setHealth, fail).finally(() => setBusy(false));
  }, []);

  useEffect(load, [load]);

  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <p className="text-sm text-muted-foreground">
          Status der Anbindungen{health ? ` · Version ${health.version}` : ""}
          {current?.changedBy ? ` · zuletzt geändert von ${current.changedBy}${current.changedAt ? ` am ${new Date(current.changedAt).toLocaleString("de-DE")}` : ""}` : ""}
        </p>
        <Button variant="outline" size="sm" onClick={load} disabled={busy}>
          <RefreshCw className={busy ? "animate-spin" : undefined} aria-hidden />
          Neu prüfen
        </Button>
      </div>
      {error && <p role="alert" className="text-sm text-destructive">{error}</p>}
      <div className="grid items-start gap-4 lg:grid-cols-2 2xl:grid-cols-3">
        {SETTINGS_SECTIONS.map((section, i) => (
          <SettingsCard
            key={section.id}
            section={section}
            view={current?.sections[section.id]}
            status={health?.details?.[section.id]}
            index={i}
            onSaved={(next) => {
              setCurrent(next);
              api.health().then(setHealth, () => undefined);
            }}
          />
        ))}
      </div>
      <p className="text-xs text-muted-foreground">
        Geänderte Werte liegen in einer eigenen Datei des Dienstes, Passwörter verschlüsselt; ohne Änderung gelten die Werte
        aus der .env. Zertifikate (CA) bleiben in der .env.
      </p>
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
  // Anmeldungen ist eine große Tabelle: wie die Bereiche auf Fensterhöhe, nur die Zeilen scrollen, unten blättern
  const fill = tab === "anmeldungen";
  return (
    <div className={cn("flex w-full flex-col gap-4", fill && "min-h-0 flex-1")}>
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
