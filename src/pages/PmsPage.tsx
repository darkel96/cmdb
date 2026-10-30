import { useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router";
import { DataTable, type Column } from "@/components/DataTable";
import { api } from "@/lib/api";
import { PMS_AREA, PMS_PRICE_COLUMNS, euro, pmsSum, type PmsModule, type PmsPrices, type PmsResponse } from "@/lib/pms";

type Row = PmsModule & { company: string };

const priceSort = (v: number | null) => (v === null ? "" : String(Math.round(v * 100)).padStart(14, "0"));

const COLUMNS: Column<Row>[] = [
  { key: "contractId", label: "Oracle-ESL", value: (r) => String(r.contractId), width: 100, className: "tabular-nums" },
  { key: "company", label: "Kunde", value: (r) => r.company, width: 240 },
  { key: "module", label: "PMS-Modul", value: (r) => r.module, width: 220 },
  ...PMS_PRICE_COLUMNS.map(
    (c): Column<Row> => ({ key: c.key, label: c.label, value: (r) => euro(r[c.key]), sortValue: (r) => priceSort(r[c.key]), width: 150, className: "tabular-nums text-right" }),
  ),
];

function PriceTable({ caption, first, rows, error }: { caption: string; first: string; rows: ({ module: string } & PmsPrices)[]; error?: string }) {
  return (
    <section aria-label={caption} className="animate-appear min-w-0 overflow-hidden rounded-lg border bg-card shadow-xs">
      <h2 className="bg-brand px-4 py-2 font-medium text-brand-foreground">{caption}</h2>
      {error ? (
        <p className="px-4 py-3 text-sm text-muted-foreground">{error}</p>
      ) : (
      <div className="scroll-thin overflow-x-auto">
        <table className="w-full text-sm">
          <thead className="border-b">
            <tr>
              <th className="px-3 py-1.5 text-left font-medium text-muted-foreground">{first}</th>
              {PMS_PRICE_COLUMNS.map((c) => (
                <th key={c.key} className="whitespace-nowrap px-3 py-1.5 text-right font-medium text-muted-foreground">
                  {c.label}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {rows.map((r) => (
              <tr key={r.module} className="border-b last:border-0">
                <td className="px-3 py-1">{r.module}</td>
                {PMS_PRICE_COLUMNS.map((c) => (
                  <td key={c.key} className="px-3 py-1 text-right tabular-nums">
                    {euro(r[c.key])}
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      )}
    </section>
  );
}

/** Software › PMS-Module: alle Module an Oracle-ESL-Verträgen, Summen und Preisliste, nur lesend */
export function PmsPage() {
  const navigate = useNavigate();
  const [data, setData] = useState<PmsResponse | null>(null);
  const [companies, setCompanies] = useState<Map<number, string>>(new Map());
  const [error, setError] = useState("");

  useEffect(() => {
    const text = (e: unknown) => (e instanceof Error ? e.message : String(e));
    api.pms().then(setData, (e: unknown) => setError(text(e)));
    api.area(PMS_AREA).then((r) => setCompanies(new Map(r.items.map((c) => [c.id, String(c.company ?? "")]))), (e: unknown) => setError(text(e)));
  }, []);

  const rows = useMemo<Row[]>(() => (data?.items ?? []).map((m) => ({ ...m, company: companies.get(m.contractId) ?? "" })), [data, companies]);
  const total = useMemo(() => ({ module: `Summe aller ${rows.length} Module`, ...pmsSum(rows) }), [rows]);

  return (
    <div className="flex min-h-0 flex-1 flex-col gap-3">
      {error && <p role="alert" className="rounded-md border border-destructive/30 bg-destructive/10 px-4 py-3 text-sm text-destructive">{error}</p>}
      {!data && !error && <p className="text-sm text-muted-foreground">Wird geladen …</p>}
      {data && (
        <>
          <div className="grid shrink-0 gap-3 xl:grid-cols-2">
            <PriceTable caption="Preisliste" first="PMS-Modul" rows={data.prices} error={data.pricesError} />
            <PriceTable caption="Summen" first="Vergebene Module" rows={[total]} />
          </div>
          <DataTable
            title="Übersicht PMS-Module"
            columns={COLUMNS}
            rows={rows}
            rowKey={(r) => r.id}
            exportName="pms-module"
            viewKey="pms-module"
            emptyText="Keine PMS-Module gefunden."
            defaultSort={{ key: "contractId", desc: false }}
            onOpen={(r) =>
              navigate(`/bereich/${PMS_AREA}/${r.contractId}`, { viewTransition: true, state: { back: { to: "/bereich/pms-module", label: "Zurück zu PMS-Module" } } })
            }
          />
          {data.source === "test" && <p className="shrink-0 text-xs text-muted-foreground">Alle Einträge sind erfunden.</p>}
        </>
      )}
    </div>
  );
}
