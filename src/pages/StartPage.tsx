import { useEffect, useState } from "react";
import { DataTable, type Column } from "@/components/DataTable";
import { api } from "@/lib/api";
import type { Customer, CustomerListResponse } from "@/lib/types";

const COLUMNS: Column<Customer>[] = [
  { key: "name", label: "Kunde", value: (c) => c.name },
  { key: "city", label: "Stadt", value: (c) => c.city },
];

/** Startseite: Kundenübersicht aus dbo.DS_Kunden (nur lesend), im Testmodus erfundene Kunden */
export function StartPage() {
  const [data, setData] = useState<CustomerListResponse | null>(null);
  const [error, setError] = useState("");

  useEffect(() => {
    api.customers().then(setData, (e: unknown) => setError(e instanceof Error ? e.message : String(e)));
  }, []);

  return (
    <div className="flex min-h-0 flex-1 flex-col gap-3">
      {error && (
        <p role="alert" className="rounded-md border border-destructive/30 bg-destructive/10 px-4 py-3 text-sm text-destructive">
          {error}
        </p>
      )}
      {!data && !error && <p className="text-sm text-muted-foreground">Wird geladen …</p>}
      {data && <DataTable title="Kundenübersicht" columns={COLUMNS} rows={data.items} rowKey={(c) => c.id} exportName="kunden" emptyText="Keine Kunden gefunden." />}
      {data?.source === "test" && <p className="shrink-0 text-xs text-muted-foreground">Alle Kunden sind erfunden.</p>}
    </div>
  );
}
