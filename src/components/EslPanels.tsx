import { useCallback, useEffect, useState, type ReactNode } from "react";
import { Pencil, Plus, Trash2 } from "lucide-react";
import { Link } from "react-router";
import { api } from "@/lib/api";
import type { AreaRow } from "@/lib/areas";
import { useAuth } from "@/state/auth";
import { PMS_PRICE_COLUMNS, PMS_WRITE, euro, euroInput, parseEuro, pmsSum, type PmsModule, type PmsPrices, type PmsResponse } from "@/lib/pms";
import { Button } from "@/components/ui/button";
import { Combobox } from "@/components/ui/combobox";
import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";

function Panel({ title, action, small, children }: { title: string; action?: ReactNode; small?: boolean; children: ReactNode }) {
  return (
    <section className="animate-appear min-w-0 overflow-hidden rounded-lg border bg-card shadow-xs" aria-label={title}>
      <div className={cn("flex items-center justify-between gap-2 px-4 py-2.5", small ? "border-b" : "bg-brand text-brand-foreground")}>
        <h2 className={small ? "font-medium" : "text-lg font-medium"}>{title}</h2>
        {action}
      </div>
      <div className="scroll-thin overflow-x-auto">{children}</div>
    </section>
  );
}

const th = "whitespace-nowrap px-3 py-2 text-left font-medium text-muted-foreground";
const td = "px-3 py-1.5";
const errorText = (e: unknown) => (e instanceof Error ? e.message : String(e));

type Draft = Record<keyof PmsPrices, string>;

/** PMS-Module des Vertrags mit Summe; mit Recht PMS-Module hinzufügen (aus der Preisliste), Preise ändern, entfernen */
export function EslPmsPanel({ contractId }: { contractId: number }) {
  const { can } = useAuth();
  const [data, setData] = useState<PmsResponse | null>(null);
  const [error, setError] = useState("");
  // Fehler einer Aktion (z. B. inzwischen geändert); die Tabelle bleibt sichtbar
  const [notice, setNotice] = useState("");
  const [busy, setBusy] = useState(false);
  const [adding, setAdding] = useState(false);
  const [pick, setPick] = useState("");
  const [editing, setEditing] = useState<{ id: number; draft: Draft } | null>(null);
  const [removing, setRemoving] = useState<number | null>(null);

  const load = useCallback(() => api.pms().then(setData, (e: unknown) => setError(errorText(e))), []);
  useEffect(() => {
    void load();
  }, [load, contractId]);

  const mayAdd = can(PMS_WRITE, "create");
  const mayEdit = can(PMS_WRITE, "edit");
  const mayDelete = can(PMS_WRITE, "delete");
  const items = data?.items.filter((m) => m.contractId === contractId) ?? null;
  const sum = items && pmsSum(items);
  const choices = (data?.prices ?? []).map((p) => p.module).filter((name) => !items?.some((m) => m.module === name));

  async function run(action: () => Promise<unknown>) {
    setBusy(true);
    setNotice("");
    try {
      await action();
      setAdding(false);
      setPick("");
      setEditing(null);
      setRemoving(null);
      await load();
    } catch (e) {
      setNotice(errorText(e));
    } finally {
      setBusy(false);
    }
  }

  function savePrices(m: PmsModule, draft: Draft) {
    const prices = {} as PmsPrices;
    for (const c of PMS_PRICE_COLUMNS) {
      const value = parseEuro(draft[c.key]);
      if (value === undefined) return setNotice(`${c.label}: ungültiger Betrag (z. B. 1.234,50).`);
      prices[c.key] = value;
    }
    void run(() => api.updatePmsModule(m.id, prices, m));
  }

  const actions = mayEdit || mayDelete;
  return (
    <Panel
      title="PMS-Module"
      action={
        mayAdd && data && !data.pricesError && !adding ? (
          <Button size="sm" variant="outline" className="h-7 border-white/40 bg-white/15 text-brand-foreground hover:bg-white/25 hover:text-brand-foreground" onClick={() => setAdding(true)}>
            <Plus aria-hidden />
            Modul hinzufügen
          </Button>
        ) : undefined
      }
    >
      {notice && <p role="alert" className="border-b px-4 py-2 text-sm text-destructive">{notice}</p>}
      {adding && (
        <div className="flex flex-wrap items-center gap-2 border-b px-4 py-3" role="group" aria-label="Modul hinzufügen">
          <Combobox
            id={`pms-pick-${contractId}`}
            label="PMS-Modul aus der Preisliste"
            value={pick}
            options={choices}
            onChange={setPick}
            placeholder={choices.length ? "– Modul wählen –" : "Alle Module der Preisliste sind schon da"}
            clearable={false}
            disabled={!choices.length}
            className="min-w-56 flex-1"
          />
          <Button size="sm" disabled={!pick || busy} onClick={() => void run(() => api.addPmsModule(contractId, pick))}>
            {busy ? "Wird gespeichert …" : "Hinzufügen"}
          </Button>
          <Button size="sm" variant="ghost" onClick={() => (setAdding(false), setPick(""), setNotice(""))}>
            Abbrechen
          </Button>
          <p className="w-full text-xs text-muted-foreground">Die Preise werden aus der Preisliste übernommen und lassen sich danach je Vertrag ändern.</p>
        </div>
      )}
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
              {actions && <th className={th}><span className="sr-only">Aktionen</span></th>}
            </tr>
          </thead>
          <tbody>
            {items.map((m) => {
              const draft = editing?.id === m.id ? editing.draft : null;
              return (
                <tr key={m.id} className="border-b last:border-0">
                  <td className={td}>{m.module}</td>
                  {PMS_PRICE_COLUMNS.map((c) => (
                    <td key={c.key} className={`${td} text-right tabular-nums`}>
                      {draft ? (
                        <Input
                          aria-label={`${m.module}: ${c.label}`}
                          inputMode="decimal"
                          className="h-8 w-32 text-right tabular-nums"
                          value={draft[c.key]}
                          onChange={(e) => setEditing({ id: m.id, draft: { ...draft, [c.key]: e.target.value } })}
                          onKeyDown={(e) => e.key === "Enter" && savePrices(m, draft)}
                        />
                      ) : (
                        euro(m[c.key])
                      )}
                    </td>
                  ))}
                  {actions && (
                    <td className={`${td} whitespace-nowrap text-right`}>
                      {draft ? (
                        <>
                          <Button size="sm" disabled={busy} onClick={() => savePrices(m, draft)}>
                            Speichern
                          </Button>
                          <Button size="sm" variant="ghost" onClick={() => (setEditing(null), setNotice(""))}>
                            Abbrechen
                          </Button>
                        </>
                      ) : removing === m.id ? (
                        <span role="alertdialog" aria-label={`${m.module} entfernen`} className="inline-flex items-center gap-1 text-destructive">
                          Entfernen?
                          <Button size="sm" className="bg-destructive text-white hover:bg-destructive/90" disabled={busy} onClick={() => void run(() => api.deletePmsModule(m.id, m))}>
                            Ja
                          </Button>
                          <Button size="sm" variant="ghost" onClick={() => setRemoving(null)}>
                            Nein
                          </Button>
                        </span>
                      ) : (
                        <>
                          {mayEdit && (
                            <Button
                              size="sm"
                              variant="ghost"
                              aria-label={`${m.module}: Preise ändern`}
                              title="Preise ändern"
                              onClick={() => (setRemoving(null), setNotice(""), setEditing({ id: m.id, draft: Object.fromEntries(PMS_PRICE_COLUMNS.map((c) => [c.key, euroInput(m[c.key])])) as Draft }))}
                            >
                              <Pencil aria-hidden />
                            </Button>
                          )}
                          {mayDelete && (
                            <Button
                              size="sm"
                              variant="ghost"
                              className="text-destructive hover:text-destructive"
                              aria-label={`${m.module} entfernen`}
                              title="Entfernen"
                              onClick={() => (setEditing(null), setNotice(""), setRemoving(m.id))}
                            >
                              <Trash2 aria-hidden />
                            </Button>
                          )}
                        </>
                      )}
                    </td>
                  )}
                </tr>
              );
            })}
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
                {actions && <td />}
              </tr>
            </tfoot>
          )}
        </table>
      )}
    </Panel>
  );
}

/**
 * Oracle-Systeme desselben Kunden (Bereich Oracle), wie GAPTEQ „Oracle Inventarisierungen“; als kurze Liste für die
 * schmale rechte Spalte. Nur mit Leserecht Oracle.
 */
export function EslOraclePanel({ row }: { row: AreaRow }) {
  const { can } = useAuth();
  const company = String(row.company ?? "");
  const back = { to: `/bereich/oracle-esl/${row.id}`, label: `Zurück zu Oracle-ESL ${row.id}` };
  const [rows, setRows] = useState<AreaRow[] | null>(null);
  const [error, setError] = useState("");
  const allowed = can("oracle", "read");

  useEffect(() => {
    if (!allowed) return;
    const name = company.trim().toLowerCase();
    api.area("oracle").then((r) => setRows(r.items.filter((o) => String(o.company ?? "").trim().toLowerCase() === name)), (e: unknown) => setError(errorText(e)));
  }, [company, allowed]);

  if (!allowed) return null;
  return (
    <Panel title="Oracle-Inventarisierungen" small>
      {error ? (
        <p className="px-4 py-3 text-sm text-muted-foreground">{error}</p>
      ) : !rows ? (
        <p className="px-4 py-3 text-sm text-muted-foreground">Wird geladen …</p>
      ) : rows.length === 0 ? (
        <p className="px-4 py-3 text-sm text-muted-foreground">Keine Oracle-Systeme bei diesem Kunden</p>
      ) : (
        <ul className="divide-y text-sm">
          {rows.map((o) => (
            <li key={o.id} className="flex items-baseline gap-3 px-4 py-2">
              <Link to={`/bereich/oracle/${o.id}`} state={{ back }} viewTransition className="shrink-0 tabular-nums text-brand underline-offset-4 hover:underline">
                {o.id}
              </Link>
              <span className="min-w-0">
                <span className="block">
                  {[o.dbType, o.dbVersion].filter(Boolean).join(" · ") || "–"}
                </span>
                {(o.hostname || o.notes) && <span className="block truncate text-xs text-muted-foreground">{[o.hostname, o.notes].filter(Boolean).join(" · ")}</span>}
              </span>
            </li>
          ))}
        </ul>
      )}
    </Panel>
  );
}
