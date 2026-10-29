import { useEffect, useState } from "react";
import { ArrowLeft, Printer } from "lucide-react";
import { Link, useParams } from "react-router";
import { BrandLogo } from "@/components/Branding";
import { Button } from "@/components/ui/button";
import { api } from "@/lib/api";
import { AREAS, type Area, type AreaRow, type CustomerDetailResponse } from "@/lib/areas";
import { cn } from "@/lib/utils";
import { useAuth } from "@/state/auth";
import { expiringBefore } from "./ExpiringPage";

const deDate = (iso: string) => (/^\d{4}-\d{2}-\d{2}$/.test(iso) ? `${iso.slice(8, 10)}.${iso.slice(5, 7)}.${iso.slice(0, 4)}` : iso);
const text = (row: AreaRow, ...keys: string[]) => keys.map((k) => String(row[k] ?? "").trim()).find(Boolean) ?? "";
const isEol = (row: AreaRow) => String(row.eol ?? "").toLowerCase() === "ja";

/** Bezeichnung und Kennung je nach Bereich; Lizenzschlüssel und Passwörter stehen bewusst nicht im Datenblatt */
const label = (row: AreaRow) => text(row, "model", "product", "licenseType", "dbType", "function", "manufacturer") || (row.sensorCount ? `${row.sensorCount} Sensoren` : "");
const ident = (row: AreaRow) => text(row, "serviceTag", "serialNumber", "hostname", "dbVersion", "os");

/**
 * Kundendatenblatt zum Drucken bzw. als PDF (Drucken › Als PDF speichern): Kundendaten, Kennzahlen, alle Systeme je
 * Bereich mit Support-Ende, EOL und Status, Dokumentenliste. Kopf- und Seitenleiste blendet der Druck aus.
 */
export function CustomerSheetPage() {
  const { customerId = "" } = useParams();
  const { user } = useAuth();
  const [data, setData] = useState<CustomerDetailResponse | null>(null);
  const [error, setError] = useState("");

  useEffect(() => {
    api.customer(Number(customerId)).then(setData, (e: unknown) => setError(e instanceof Error ? e.message : String(e)));
  }, [customerId]);

  if (error) return <p role="alert" className="text-sm text-destructive">{error}</p>;
  if (!data) return <p className="text-sm text-muted-foreground">Wird geladen …</p>;

  const cutoff = expiringBefore();
  const areas = Object.values(AREAS).filter((a) => data.systems[a.id]?.length);
  const rows = areas.flatMap((a) => data.systems[a.id]);
  const expiring = (r: AreaRow) => !isEol(r) && Boolean(r.supportUntil) && String(r.supportUntil) < cutoff;
  const stats = [
    { label: "Systeme", value: rows.length },
    { label: "EOL", value: rows.filter(isEol).length, tone: "text-destructive" },
    { label: "Support läuft bald aus", value: rows.filter(expiring).length, tone: "text-warning-fg" },
    { label: "ohne Support-Datum", value: rows.filter((r) => !r.supportUntil).length },
  ];
  const c = data.customer;
  const today = new Date().toLocaleDateString("de-DE", { day: "2-digit", month: "2-digit", year: "numeric" });

  return (
    <div className="flex w-full flex-col items-center gap-4 print:block">
      <div className="flex w-full max-w-[210mm] items-center justify-between gap-2 print:hidden">
        <Button variant="outline" size="sm" asChild>
          <Link to={`/kunden/${c.id}`} viewTransition>
            <ArrowLeft aria-hidden />
            Zurück zu {c.name}
          </Link>
        </Button>
        <Button size="sm" onClick={() => window.print()}>
          <Printer aria-hidden />
          Drucken / als PDF speichern
        </Button>
      </div>

      <article aria-label="Kundendatenblatt" className="sheet w-full max-w-[210mm] rounded-lg border bg-white p-[12mm] text-[10pt] leading-snug text-black shadow-sm print:max-w-none print:rounded-none print:border-0 print:p-0 print:shadow-none">
        <header className="mb-6 flex items-start justify-between gap-4 border-b-2 border-brand pb-3">
          <BrandLogo variant="dunkel" className="h-12 w-auto" fallback={<span className="text-lg font-semibold text-brand">CMDB</span>} />
          <div className="text-right">
            <h1 className="text-xl font-semibold">Kundendatenblatt</h1>
            <p className="text-xs text-neutral-600">Stand {today}</p>
          </div>
        </header>

        <section className="mb-5 grid grid-cols-[8rem_1fr] gap-x-4 gap-y-1">
          <h2 className="col-span-2 mb-1 text-base font-semibold" data-testid="sheet-customer">{c.name}</h2>
          {c.address && (<><span className="text-neutral-600">Adresse</span><span>{c.address}</span></>)}
          <span className="text-neutral-600">Ort</span>
          <span>{[c.zip, c.city].filter(Boolean).join(" ") || "–"}{c.country ? `, ${c.country}` : ""}</span>
          {c.email && (<><span className="text-neutral-600">E-Mail</span><span>{c.email}</span></>)}
          <span className="text-neutral-600">Kunden-Nr.</span>
          <span>{c.id}</span>
        </section>

        <section className="mb-6 grid grid-cols-4 gap-2" aria-label="Kennzahlen">
          {stats.map((s) => (
            <div key={s.label} className="rounded border border-neutral-300 px-3 py-2">
              <div className={cn("text-2xl font-semibold tabular-nums", s.value > 0 && s.tone)}>{s.value}</div>
              <div className="text-xs text-neutral-600">{s.label}</div>
            </div>
          ))}
        </section>

        {areas.map((a) => (
          <AreaTable key={a.id} area={a} rows={data.systems[a.id]} cutoff={cutoff} />
        ))}
        {areas.length === 0 && <p className="mb-6 text-neutral-600">Für diesen Kunden sind keine Systeme angelegt.</p>}

        {data.documents.length > 0 && (
          <section className="mb-6 break-inside-avoid">
            <h3 className="mb-1.5 border-b border-neutral-300 pb-1 text-sm font-semibold">Dokumente ({data.documents.length})</h3>
            <ul className="columns-2 gap-6 text-[9pt]">
              {data.documents.map((d) => (
                <li key={d.id}>
                  {d.name}
                  {d.type && <span className="text-neutral-500"> · {d.type}</span>}
                </li>
              ))}
            </ul>
          </section>
        )}

        <footer className="mt-8 flex justify-between border-t border-neutral-300 pt-2 text-[8pt] text-neutral-500">
          <span>Interne Unterlage · erstellt mit der CMDB am {today}{user ? ` von ${user.displayName}` : ""}</span>
          <span>Rot: EOL · Gelb: Support endet bis {deDate(new Date(new Date(`${cutoff}T00:00:00`).getTime() - 86400000).toISOString().slice(0, 10))}</span>
        </footer>
      </article>
    </div>
  );
}

function AreaTable({ area, rows, cutoff }: { area: Area; rows: AreaRow[]; cutoff: string }) {
  const name = area.plural ?? area.title.replace(/^Übersicht /, "");
  const sorted = [...rows].sort((a, b) => String(a.supportUntil || "9999").localeCompare(String(b.supportUntil || "9999")));
  return (
    <section className="mb-5" aria-label={name}>
      <h3 className="mb-1.5 border-b border-neutral-300 pb-1 text-sm font-semibold [break-after:avoid]">
        {name} <span className="font-normal text-neutral-500">({rows.length})</span>
      </h3>
      <table className="w-full border-collapse text-[9pt]">
        <thead>
          <tr className="text-left text-neutral-600">
            <th className="w-[4.5rem] py-1 pr-2 font-medium">ID</th>
            <th className="py-1 pr-2 font-medium">Bezeichnung</th>
            <th className="py-1 pr-2 font-medium">Servicetag / Host</th>
            <th className="w-[5.5rem] py-1 pr-2 font-medium">Support bis</th>
            <th className="w-[2.5rem] py-1 pr-2 font-medium">EOL</th>
            <th className="w-[6rem] py-1 font-medium">Status</th>
          </tr>
        </thead>
        <tbody>
          {sorted.map((r) => {
            const eol = isEol(r);
            const soon = !eol && Boolean(r.supportUntil) && String(r.supportUntil) < cutoff;
            return (
              <tr key={r.id} className={cn("border-t border-neutral-200 [break-inside:avoid]", eol && "text-red-700", soon && "bg-amber-50")}>
                <td className="py-1 pr-2 tabular-nums">{r.id}</td>
                <td className="py-1 pr-2">{label(r) || "–"}</td>
                <td className="py-1 pr-2">{ident(r) || "–"}</td>
                <td className="py-1 pr-2 tabular-nums">
                  {deDate(String(r.supportUntil ?? "")) || "–"}
                  {r.supportSource ? <span className="text-neutral-500"> (OS)</span> : null}
                </td>
                <td className="py-1 pr-2">{String(r.eol ?? "") || "–"}</td>
                <td className="py-1">{String(r.status ?? "") || "–"}</td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </section>
  );
}
