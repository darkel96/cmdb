import type { SchemaState } from "@/lib/api";

/** Hinweis, solange das Schema cmdb fehlt (Anmelde-Protokoll und Rollen brauchen es) */
export function SchemaHint({ schema }: { schema: SchemaState }) {
  if (schema.ready) return null;
  return (
    <div role="alert" className="rounded-md border border-warning-fg/30 bg-warning-bg px-4 py-3 text-sm text-warning-fg">
      <p className="font-medium">Das Schema cmdb ist noch nicht eingerichtet.</p>
      <p className="mt-1">{schema.error}</p>
      <p className="mt-2">Einmalig auf dem SQL Server ausführen, danach den Dienst neu starten:</p>
      <pre className="mt-1 overflow-x-auto rounded bg-card px-3 py-2 font-mono text-xs text-foreground">{"USE CMDB;\nCREATE SCHEMA cmdb AUTHORIZATION svc_cmdb;\nGRANT CREATE TABLE TO svc_cmdb;"}</pre>
    </div>
  );
}
