import { useEffect, useState, type ReactNode } from "react";
import { Link } from "react-router";
import { api } from "@/lib/api";
import type { AreaRow } from "@/lib/areas";
import { useAuth } from "@/state/auth";
import { PMS_PRICE_COLUMNS, euro, pmsSum, type PmsModule } from "@/lib/pms";

function Panel({ title, children }: { title: string; children: ReactNode }) {
  return (
    <section className="animate-appear min-w-0 overflow-hidden rounded-lg border bg-card shadow-xs" aria-label={title}>
      <h2 className="bg-brand px-4 py-2.5 text-lg font-medium text-brand-foreground">{title}</h2>
      <div className="scroll-thin overflow-x-auto">{children}</div>
    </section>
  );
}

const th = "whitespace-nowrap px-3 py-2 text-left font-medium text-muted-foreground";
const td = "px-3 py-1.5";
const errorText = (e: unknown) => (e instanceof Error ? e.message : String(e));

/** PMS-Module des Vertrags mit Summe, nur lesend */
function PmsPanel({ contractId }: { contractId: number }) {
  const [items, setItems] = useState<PmsModule[] | null>(null);
  const [error, setError] = useState("");

  useEffect(() => {
    api.pms().then((r) => setItems(r.items.filter((m) => m.contractId === contractId)), (e: unknown) => setError(errorText(e)));
  }, [contractId]);

  const sum = items && pmsSum(items);
  return (
    <Panel title="PMS-Module">
      {error ? (
        <p className="p-4 text-sm text-muted-foreground">{error}</p>
      ) : !items ? (
        <p className="p-4 text-sm text-muted-foreground">Wird geladen …</p>
      ) : items.length === 0 ? (
        <p className="p-4 text-sm text-muted-foreground">Keine PMS-Module</p>
      ) : (
        <table className="w-full text-sm">
          <thead className="border-b">
            <tr>
              <th className={th}>PMS-Modul</th>
              {PMS_PRICE_COLUMNS.map((c) => (
                <th key={c.key} className={`${th} text-right`}>
                  {c.label}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {items.map((m) => (
              <tr key={m.id} className="border-b last:border-0">
                <td className={td}>{m.module}</td>
                {PMS_PRICE_COLUMNS.map((c) => (
                  <td key={c.key} className={`${td} text-right tabular-nums`}>
                    {euro(m[c.key])}
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
          {sum && (
            <tfoot className="border-t bg-muted/40 font-medium">
              <tr>
                <td className={td}>Summe</td>
                {PMS_PRICE_COLUMNS.map((c) => (
                  <td key={c.key} className={`${td} text-right tabular-nums`}>
                    {euro(sum[c.key])}
                  </td>
                ))}
              </tr>
            </tfoot>
          )}
        </table>
      )}
    </Panel>
  );
}

/** Oracle-Systeme desselben Kunden (Bereich Oracle), wie GAPTEQ „Oracle Inventarisierungen“ */
function OraclePanel({ company, back }: { company: string; back: { to: string; label: string } }) {
  const [rows, setRows] = useState<AreaRow[] | null>(null);
  const [error, setError] = useState("");

  useEffect(() => {
    const name = company.trim().toLowerCase();
    api.area("oracle").then((r) => setRows(r.items.filter((o) => String(o.company ?? "").trim().toLowerCase() === name)), (e: unknown) => setError(errorText(e)));
  }, [company]);

  return (
    <Panel title="Oracle-Inventarisierungen">
      {error ? (
        <p className="p-4 text-sm text-muted-foreground">{error}</p>
      ) : !rows ? (
        <p className="p-4 text-sm text-muted-foreground">Wird geladen …</p>
      ) : rows.length === 0 ? (
        <p className="p-4 text-sm text-muted-foreground">Keine Oracle-Systeme bei diesem Kunden</p>
      ) : (
        <table className="w-full text-sm">
          <thead className="border-b">
            <tr>
              <th className={th}>ID</th>
              <th className={th}>DB-Typ</th>
              <th className={th}>DB-Version</th>
              <th className={th}>Hostname</th>
              <th className={th}>Besonderheiten</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((o) => (
              <tr key={o.id} className="border-b last:border-0">
                <td className={`${td} tabular-nums`}>
                  <Link to={`/bereich/oracle/${o.id}`} state={{ back }} viewTransition className="text-brand underline-offset-4 hover:underline">
                    {o.id}
                  </Link>
                </td>
                <td className={td}>{o.dbType}</td>
                <td className={`${td} tabular-nums`}>{o.dbVersion}</td>
                <td className={td}>{o.hostname}</td>
                <td className={td}>{o.notes}</td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </Panel>
  );
}

/** Zusätzliche Kästen am Oracle-ESL-Vertrag: PMS-Module und Oracle-Systeme des Kunden */
export function EslPanels({ row }: { row: AreaRow }) {
  const { can } = useAuth();
  const back = { to: `/bereich/oracle-esl/${row.id}`, label: `Zurück zu Oracle-ESL ${row.id}` };
  return (
    <div className="grid gap-3 min-[120rem]:grid-cols-2">
      <PmsPanel contractId={row.id} />
      {can("oracle", "read") && <OraclePanel company={String(row.company ?? "")} back={back} />}
    </div>
  );
}
