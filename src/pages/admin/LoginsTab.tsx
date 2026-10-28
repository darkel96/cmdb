import { useEffect, useState } from "react";
import { DataTable, type Column } from "@/components/DataTable";
import { Badge } from "@/components/ui/badge";
import { api, type AdminLoginsResponse } from "@/lib/api";
import type { LoginLogEntry } from "@/lib/permissions";
import { SchemaHint } from "./SchemaHint";

function when(iso: string): string {
  return new Date(iso).toLocaleString("de-DE", { day: "2-digit", month: "2-digit", year: "numeric", hour: "2-digit", minute: "2-digit", second: "2-digit" });
}

const COLUMNS: Column<LoginLogEntry>[] = [
  { key: "at", label: "Zeitpunkt", value: (e) => when(e.at), sortValue: (e) => e.at, width: 170, className: "tabular-nums" },
  { key: "username", label: "Anmeldename", value: (e) => e.username, width: 160 },
  { key: "displayName", label: "Name", value: (e) => e.displayName, width: 200 },
  { key: "success", label: "Ergebnis", value: (e) => (e.success ? "Erfolgreich" : "Fehlgeschlagen"), width: 130 },
  { key: "reason", label: "Grund", value: (e) => e.reason },
  { key: "address", label: "Adresse", value: (e) => e.address, width: 160 },
];

/** Reiter Anmeldungen: wer sich wann angemeldet hat (letzte 1000, 365 Tage aufbewahrt) */
export function LoginsTab() {
  const [data, setData] = useState<AdminLoginsResponse | null>(null);
  const [error, setError] = useState("");
  useEffect(() => {
    api.adminLogins().then(setData, (e: unknown) => setError(e instanceof Error ? e.message : String(e)));
  }, []);
  if (error) return <p role="alert" className="text-sm text-destructive">{error}</p>;
  if (!data) return <p className="text-sm text-muted-foreground">Wird geladen …</p>;
  const failed = data.items.filter((e) => !e.success).length;
  return (
    <div className="flex min-h-0 flex-1 flex-col gap-3">
      <SchemaHint schema={data.schema} />
      <p className="flex items-center gap-2 text-sm text-muted-foreground">
        {data.items.length} Einträge
        {failed > 0 && <Badge variant="destructive">{failed} fehlgeschlagen</Badge>}
        <span>· Passwörter werden nie gespeichert · Aufbewahrung 365 Tage</span>
      </p>
      <DataTable
        title="Anmeldungen"
        columns={COLUMNS}
        rows={data.items}
        rowKey={(e) => e.id}
        exportName="anmeldungen"
        emptyText="Noch keine Anmeldungen protokolliert."
        defaultSort={{ key: "at", desc: true }}
      />
    </div>
  );
}
