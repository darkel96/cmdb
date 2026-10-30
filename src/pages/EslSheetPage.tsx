import { Fragment, useEffect, useState } from "react";
import { ArrowLeft, Printer } from "lucide-react";
import { Link, useParams } from "react-router";
import { BrandLogo } from "@/components/Branding";
import { Button } from "@/components/ui/button";
import { api } from "@/lib/api";
import { AREAS, type AreaRow } from "@/lib/areas";
import { PMS_AREA, PMS_PRICE_COLUMNS, euro, pmsSum, type PmsModule } from "@/lib/pms";
import { useAuth } from "@/state/auth";
import { NotFoundPage } from "./NotFoundPage";

const deDate = (iso: string) => (/^\d{4}-\d{2}-\d{2}$/.test(iso) ? `${iso.slice(8, 10)}.${iso.slice(5, 7)}.${iso.slice(0, 4)}` : iso);
const th = "border-b border-neutral-300 py-1 pr-3 text-left font-medium text-neutral-600";

/**
 * Datenblatt eines Oracle-ESL-Vertrags zum Drucken bzw. als PDF, wie das Kundendatenblatt: Vertragsdaten in den
 * Abschnitten des Formulars, PMS-Module mit Summe, Oracle-Systeme des Kunden (ohne IP-Adressen und Passwörter).
 */
export function EslSheetPage() {
  const { id = "", itemId = "" } = useParams();
  const { user, can } = useAuth();
  const area = AREAS[PMS_AREA];
  const [row, setRow] = useState<AreaRow | null>(null);
  const [modules, setModules] = useState<PmsModule[] | null>(null);
  const [modulesError, setModulesError] = useState("");
  const [oracle, setOracle] = useState<AreaRow[] | null>(null);
  const [error, setError] = useState("");
  const showOracle = can("oracle", "read");

  useEffect(() => {
    if (id !== PMS_AREA) return;
    const text = (e: unknown) => (e instanceof Error ? e.message : String(e));
    api.areaRow(PMS_AREA, Number(itemId)).then((r) => {
      setRow(r);
      const name = String(r.company ?? "").trim().toLowerCase();
      if (showOracle) api.area("oracle").then((o) => setOracle(o.items.filter((x) => String(x.company ?? "").trim().toLowerCase() === name)), () => setOracle([]));
    }, (e: unknown) => setError(text(e)));
    api.pms().then((p) => setModules(p.items.filter((m) => m.contractId === Number(itemId))), (e: unknown) => setModulesError(text(e)));
  }, [id, itemId, showOracle]);

  if (id !== PMS_AREA) return <NotFoundPage />;
  if (error) return <p role="alert" className="text-sm text-destructive">{error}</p>;
  if (!row) return <p className="text-sm text-muted-foreground">Wird geladen …</p>;

  const today = new Date().toLocaleDateString("de-DE", { day: "2-digit", month: "2-digit", year: "numeric" });
  const fieldOf = (key: string) => area.fields.find((f) => f.key === key);
  const value = (key: string) => {
    const f = fieldOf(key);
    const v = String(row[key] ?? "").trim();
    return f?.date ? deDate(v) : v;
  };
  const sections = (area.formSections ?? []).map((s) => ({ ...s, fields: s.fields.filter((k) => k !== "company") }));
  const sum = modules && pmsSum(modules);

  return (
    <div className="flex w-full flex-col items-center gap-4 print:block">
      <div className="flex w-full max-w-[210mm] items-center justify-between gap-2 print:hidden">
        <Button variant="outline" size="sm" asChild>
          <Link to={`/bereich/${PMS_AREA}/${row.id}`} viewTransition>
            <ArrowLeft aria-hidden />
            Zurück zu Oracle-ESL {row.id}
          </Link>
        </Button>
        <Button size="sm" onClick={() => window.print()}>
          <Printer aria-hidden />
          Drucken / als PDF speichern
        </Button>
      </div>

      <article aria-label="Datenblatt Oracle-ESL" className="sheet w-full max-w-[210mm] rounded-lg border bg-white p-[12mm] text-[10pt] leading-snug text-black shadow-sm print:max-w-none print:rounded-none print:border-0 print:px-[1.5mm] print:py-0 print:shadow-none">
        <header className="mb-6 flex items-start justify-between gap-4 border-b-2 border-brand pb-3">
          <BrandLogo variant="dunkel" className="h-12 w-auto" fallback={<span className="text-lg font-semibold text-brand">CMDB</span>} />
          <div className="text-right">
            <h1 className="text-xl font-semibold">Datenblatt Oracle-ESL</h1>
            <p className="text-xs text-neutral-600">Stand {today}</p>
          </div>
        </header>

        <section className="mb-5">
          <h2 className="text-base font-semibold" data-testid="sheet-customer">{String(row.company ?? "")}</h2>
          <p className="text-neutral-600">Oracle-ESL-Vertrag {row.id}</p>
        </section>

        <section className="mb-6 grid grid-cols-2 gap-x-8 gap-y-4" aria-label="Vertragsdaten">
          {sections.map((s) => (
            <div key={s.label} className="break-inside-avoid">
              <h3 className="mb-1.5 border-b border-neutral-300 pb-1 text-sm font-semibold">{s.label}</h3>
              <dl className="grid grid-cols-[11rem_1fr] gap-x-3 gap-y-0.5 text-[9pt]">
                {s.fields.map((k) => (
                  <Fragment key={k}>
                    <dt className="text-neutral-600">{fieldOf(k)?.formLabel ?? fieldOf(k)?.label}</dt>
                    <dd>{value(k) || "–"}</dd>
                  </Fragment>
                ))}
              </dl>
            </div>
          ))}
        </section>

        <section className="mb-6 break-inside-avoid" aria-label="PMS-Module">
          <h3 className="mb-1.5 border-b border-neutral-300 pb-1 text-sm font-semibold">PMS-Module {modules && <span className="font-normal text-neutral-500">({modules.length})</span>}</h3>
          {modulesError ? (
            <p className="text-neutral-600">{modulesError}</p>
          ) : !modules ? (
            <p className="text-neutral-600">Wird geladen …</p>
          ) : modules.length === 0 ? (
            <p className="text-neutral-600">Keine PMS-Module.</p>
          ) : (
            <table className="w-full text-[9pt]">
              <thead>
                <tr>
                  <th className={th}>PMS-Modul</th>
                  {PMS_PRICE_COLUMNS.map((c) => (
                    <th key={c.key} className={`${th} text-right`}>{c.label}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {modules.map((m) => (
                  <tr key={m.id}>
                    <td className="py-0.5 pr-3">{m.module}</td>
                    {PMS_PRICE_COLUMNS.map((c) => (
                      <td key={c.key} className="py-0.5 pr-3 text-right tabular-nums">{euro(m[c.key])}</td>
                    ))}
                  </tr>
                ))}
              </tbody>
              {sum && (
                <tfoot>
                  <tr className="border-t border-neutral-400 font-semibold">
                    <td className="py-1 pr-3">Summe</td>
                    {PMS_PRICE_COLUMNS.map((c) => (
                      <td key={c.key} className="py-1 pr-3 text-right tabular-nums">{euro(sum[c.key])}</td>
                    ))}
                  </tr>
                </tfoot>
              )}
            </table>
          )}
        </section>

        {showOracle && (
          <section className="mb-6 break-inside-avoid" aria-label="Oracle-Systeme">
            <h3 className="mb-1.5 border-b border-neutral-300 pb-1 text-sm font-semibold">Oracle-Systeme des Kunden {oracle && <span className="font-normal text-neutral-500">({oracle.length})</span>}</h3>
            {!oracle ? (
              <p className="text-neutral-600">Wird geladen …</p>
            ) : oracle.length === 0 ? (
              <p className="text-neutral-600">Keine Oracle-Systeme bei diesem Kunden.</p>
            ) : (
              <table className="w-full text-[9pt]">
                <thead>
                  <tr>
                    <th className={th}>ID</th>
                    <th className={th}>DB-Typ</th>
                    <th className={th}>DB-Version</th>
                    <th className={th}>Hostname</th>
                    <th className={th}>Besonderheiten</th>
                  </tr>
                </thead>
                <tbody>
                  {oracle.map((o) => (
                    <tr key={o.id}>
                      <td className="py-0.5 pr-3 tabular-nums">{o.id}</td>
                      <td className="py-0.5 pr-3">{o.dbType}</td>
                      <td className="py-0.5 pr-3 tabular-nums">{o.dbVersion}</td>
                      <td className="py-0.5 pr-3">{o.hostname}</td>
                      <td className="py-0.5 pr-3">{o.notes}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </section>
        )}

        <footer className="mt-8 border-t border-neutral-300 pt-2 text-[8pt] text-neutral-500">
          Interne Unterlage · erstellt mit der CMDB am {today}
          {user ? ` von ${user.displayName}` : ""}
        </footer>
      </article>
    </div>
  );
}
