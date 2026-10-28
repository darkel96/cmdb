import { useEffect, useState } from "react";
import { Badge } from "@/components/ui/badge";
import { Card, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { api } from "@/lib/api";
import type { CiListResponse, ConfigurationItem } from "@/lib/types";

const STATUS_VARIANT: Record<ConfigurationItem["status"], "success" | "secondary" | "outline"> = { Aktiv: "success", Geplant: "secondary", "Ausser Betrieb": "outline" };

function formatDate(iso: string): string {
  const [y, m, d] = iso.split("-");
  return `${d}.${m}.${y}`;
}

/** Platzhalter für Phase 1: im Testmodus eine erfundene CI-Liste, sonst ein Hinweis */
export function OverviewPage() {
  const [data, setData] = useState<CiListResponse | null>(null);
  const [error, setError] = useState("");

  useEffect(() => {
    api.cis().then(setData, (e: unknown) => setError(e instanceof Error ? e.message : String(e)));
  }, []);

  return (
    <div className="flex flex-col gap-6">
      <div>
        <h1 className="text-2xl font-semibold">Übersicht</h1>
        <p className="text-sm text-muted-foreground">Configuration Items über alle Typen. Die Anbindung an den Bestand folgt in Phase 1.</p>
      </div>
      {error && <p role="alert" className="text-sm text-destructive">{error}</p>}
      {data?.source === "none" && (
        <Card>
          <CardHeader>
            <CardTitle>Noch keine Daten</CardTitle>
            <CardDescription>Phase 0 richtet Anmeldung, Rollen und Betrieb ein. Die CI-Liste aus der Datenbank kommt mit Phase 1 (nur lesend).</CardDescription>
          </CardHeader>
        </Card>
      )}
      {data && data.items.length > 0 && (
        <div className="overflow-x-auto rounded-lg border bg-card">
          <table className="w-full text-sm" aria-label="Configuration Items">
            <thead className="border-b bg-muted/50 text-left text-muted-foreground">
              <tr>
                <th className="px-4 py-2 font-medium">Name</th>
                <th className="px-4 py-2 font-medium">Typ</th>
                <th className="px-4 py-2 font-medium">Firma</th>
                <th className="px-4 py-2 font-medium">Hersteller / Modell</th>
                <th className="px-4 py-2 font-medium">Status</th>
                <th className="px-4 py-2 font-medium">Support bis</th>
              </tr>
            </thead>
            <tbody>
              {data.items.map((ci) => (
                <tr key={ci.id} className="border-b last:border-0">
                  <td className="px-4 py-2 font-mono text-xs">{ci.name}</td>
                  <td className="px-4 py-2">{ci.type}</td>
                  <td className="px-4 py-2">{ci.company}</td>
                  <td className="px-4 py-2">{ci.manufacturer} · {ci.model}</td>
                  <td className="px-4 py-2"><Badge variant={STATUS_VARIANT[ci.status]}>{ci.status}</Badge></td>
                  <td className="px-4 py-2 tabular-nums">{formatDate(ci.supportUntil)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
      {data?.source === "test" && <p className="text-xs text-muted-foreground">Alle Einträge sind erfunden.</p>}
    </div>
  );
}
