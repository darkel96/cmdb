import { useEffect, useState } from "react";
import { ArrowLeft } from "lucide-react";
import { Link, useNavigate, useParams } from "react-router";
import { DataTable, type Column } from "@/components/DataTable";
import { Button } from "@/components/ui/button";
import { api } from "@/lib/api";
import { longDate, shortDate } from "@/lib/format";
import type { Server, ServerListResponse } from "@/lib/types";

const COLUMNS: Column<Server>[] = [
  { key: "id", label: "ID", value: (s) => String(s.id), width: 70, className: "tabular-nums" },
  { key: "company", label: "Firma", value: (s) => s.company, width: 180 },
  { key: "supplier", label: "Lieferant", value: (s) => s.supplier, width: 130 },
  { key: "deliveredOn", label: "Lieferdatum", value: (s) => shortDate(s.deliveredOn), sortValue: (s) => s.deliveredOn ?? "", width: 100, className: "tabular-nums" },
  { key: "orderNumber", label: "Bestellnummer", value: (s) => s.orderNumber, width: 130 },
  { key: "manufacturer", label: "Hersteller", value: (s) => s.manufacturer, width: 110 },
  { key: "model", label: "Modell", value: (s) => s.model, width: 180 },
  { key: "serverType", label: "Servertyp", value: (s) => s.serverType, width: 140 },
  { key: "serviceTag", label: "Servicetag", value: (s) => s.serviceTag, width: 120 },
  { key: "maintenanceType", label: "Wartungstyp", value: (s) => s.maintenanceType, width: 130 },
  { key: "supportUntil", label: "Support bis", value: (s) => shortDate(s.supportUntil), sortValue: (s) => s.supportUntil ?? "", width: 100, className: "tabular-nums" },
  { key: "eol", label: "EOL", value: (s) => s.eol, width: 70 },
  { key: "notes", label: "Besonderheiten", value: (s) => s.notes, width: 160 },
];

/** Hardware › Server: Übersicht aus dbo.Server_manuell (nur lesend) */
export function ServersPage() {
  const navigate = useNavigate();
  const [data, setData] = useState<ServerListResponse | null>(null);
  const [error, setError] = useState("");

  useEffect(() => {
    api.servers().then(setData, (e: unknown) => setError(e instanceof Error ? e.message : String(e)));
  }, []);

  return (
    <div className="flex min-h-0 flex-1 flex-col gap-3">
      {error && <p role="alert" className="rounded-md border border-destructive/30 bg-destructive/10 px-4 py-3 text-sm text-destructive">{error}</p>}
      {!data && !error && <p className="text-sm text-muted-foreground">Wird geladen …</p>}
      {data && (
        <DataTable
          title="Übersicht Server"
          columns={COLUMNS}
          rows={data.items}
          rowKey={(s) => s.id}
          exportName="server"
          emptyText="Keine Server gefunden."
          onOpen={(s) => navigate(`/bereich/server/${s.id}`, { viewTransition: true })}
        />
      )}
      {data?.source === "test" && <p className="shrink-0 text-xs text-muted-foreground">Alle Server sind erfunden.</p>}
    </div>
  );
}

const FIELDS: { label: string; value: (s: Server) => string }[] = [
  { label: "ID", value: (s) => String(s.id) },
  { label: "Typ", value: (s) => s.type },
  { label: "Status", value: (s) => s.status },
  { label: "Firma", value: (s) => s.company },
  { label: "Lieferant", value: (s) => s.supplier },
  { label: "Lieferdatum", value: (s) => longDate(s.deliveredOn) },
  { label: "Bestellnummer", value: (s) => s.orderNumber },
  { label: "Hersteller", value: (s) => s.manufacturer },
  { label: "Modell", value: (s) => s.model },
  { label: "Servertyp", value: (s) => s.serverType },
  { label: "Servicetag", value: (s) => s.serviceTag },
  { label: "Wartungstyp", value: (s) => s.maintenanceType },
  { label: "Support bis", value: (s) => longDate(s.supportUntil) },
  { label: "EOL", value: (s) => s.eol },
  { label: "Besonderheiten", value: (s) => s.notes },
];

/** Ein Server, nur lesend (Bearbeiten kommt mit Phase 2) */
export function ServerDetailPage() {
  const { serverId = "" } = useParams();
  const [server, setServer] = useState<Server | null>(null);
  const [error, setError] = useState("");

  useEffect(() => {
    api.server(Number(serverId)).then(setServer, (e: unknown) => setError(e instanceof Error ? e.message : String(e)));
  }, [serverId]);

  return (
    <div className="mx-auto flex w-full max-w-4xl flex-col gap-3">
      <Button variant="outline" size="sm" className="self-start" asChild>
        <Link to="/bereich/server" viewTransition>
          <ArrowLeft aria-hidden />
          Zurück zur Übersicht
        </Link>
      </Button>
      {error && <p role="alert" className="text-sm text-destructive">{error}</p>}
      {server && (
        <section className="animate-appear overflow-hidden rounded-lg border bg-card shadow-xs" aria-label={`Server ${server.id}`}>
          <h1 className="bg-brand px-4 py-2.5 text-lg font-medium text-brand-foreground">
            Server {server.id}
            {server.serviceTag && ` · ${server.serviceTag}`}
          </h1>
          <dl className="grid gap-x-6 gap-y-3 p-4 text-sm sm:grid-cols-[10rem_1fr]">
            {FIELDS.map((f) => (
              <div key={f.label} className="contents">
                <dt className="text-muted-foreground">{f.label}</dt>
                <dd className="min-h-5 break-words">{f.value(server) || "–"}</dd>
              </div>
            ))}
          </dl>
          <p className="border-t px-4 py-2 text-xs text-muted-foreground">Nur lesend. Ändern ist weiterhin in GAPTEQ möglich.</p>
        </section>
      )}
    </div>
  );
}
