import { Fragment, useEffect, useState } from "react";
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
const todayIso = () => new Date().toISOString().slice(0, 10);

/** Bezeichnung und Kennung je nach Bereich; Lizenzschlüssel, IP-Adressen und Passwörter stehen bewusst nicht im Datenblatt */
const label = (row: AreaRow) => text(row, "model", "product", "licenseType", "dbType", "function", "manufacturer") || (row.sensorCount ? `${row.sensorCount} Sensoren` : "");
const ident = (row: AreaRow) => text(row, "serviceTag", "serialNumber", "hostname");

/** Support-Ende je System: „Support bis“; bei Oracle die Softwarepflege, sonst der IT-Service */
const supportDate = (row: AreaRow) => text(row, "supportUntil", "softwareContractEnd", "itServiceContractEnd");

/** abgelaufen: EOL oder Support vorbei (rot); bald: endet bis zum Stichtag (gelb) */
function state(row: AreaRow, cutoff: string): "abgelaufen" | "bald" | "" {
  const d = supportDate(row);
  if (isEol(row) || (d && d < todayIso())) return "abgelaufen";
  return d && d < cutoff ? "bald" : "";
}

/** Zusatzangaben je Bereich (OS, Version, Typ, Wartung, Anzahl) */
function details(areaId: string, row: AreaRow): string {
  const join = (...v: unknown[]) => v.map((x) => String(x ?? "").trim()).filter(Boolean).join(" · ");
  switch (areaId) {
    case "windows":
      return join(row.os);
    case "oracle":
      return join(row.dbVersion, row.os);
    case "server":
      return join(row.serverType, row.maintenanceType);
    case "storage":
      return join(row.maintenanceType, row.diskCount && row.diskType ? `${row.diskCount}× ${row.diskType}` : row.diskType);
    case "switche":
      return join(row.lwlType);
    case "tsplus":
      return join(row.licenseCount ? `${row.licenseCount} Lizenzen` : "", row.licensee);
    case "kepware":
      return join(row.version, row.licensee);
    case "vmware":
    case "veeam":
    case "lizenzen":
      return join(row.licensee);
    default:
      return "";
  }
}

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
  // Oracle-ESL (Verträge) als eigener Block, nicht als System
  const contracts = data.systems["oracle-esl"] ?? [];
  const systemAreas = areas.filter((a) => a.id !== "oracle-esl");
  const systems = systemAreas.flatMap((a) => data.systems[a.id].map((row) => ({ area: a, row })));
  const stats = [
    { label: "Systeme", value: systems.length },
    { label: "EOL oder ohne Support", value: systems.filter((s) => state(s.row, cutoff) === "abgelaufen").length, tone: "text-destructive" },
    { label: "Support läuft bald aus", value: systems.filter((s) => state(s.row, cutoff) === "bald").length, tone: "text-warning-fg" },
    { label: "ohne Support-Datum", value: systems.filter((s) => !supportDate(s.row)).length },
  ];
  const next = systems
    .filter((s) => supportDate(s.row) >= todayIso())
    .sort((a, b) => supportDate(a.row).localeCompare(supportDate(b.row)))[0];
  const expired = systems.filter((s) => supportDate(s.row) && supportDate(s.row) < todayIso()).length;
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

      <article aria-label="Kundendatenblatt" className="sheet w-full max-w-[210mm] rounded-lg border bg-white p-[12mm] text-[10pt] leading-snug text-black shadow-sm print:max-w-none print:rounded-none print:border-0 print:px-[1.5mm] print:py-0 print:shadow-none">
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
          <span className="text-neutral-600">{c.address && placeIn(c.address, c.zip, c.city) ? "Land" : "Ort"}</span>
          <span>{placeLine(c.address, c.zip, c.city, c.country) || "–"}</span>
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

        {(next || expired > 0) && (
          <p className="-mt-3 mb-6 text-[9pt] text-neutral-700" data-testid="sheet-next">
            {next && (
              <>
                Nächstes Support-Ende: <strong>{deDate(supportDate(next.row))}</strong> · {next.area.singular} {next.row.id}
                {label(next.row) ? ` (${label(next.row)})` : ""}
              </>
            )}
            {next && expired > 0 && " · "}
            {expired > 0 && <span className="text-red-700">{expired} {expired === 1 ? "System" : "Systeme"} bereits ohne Support</span>}
          </p>
        )}

        {systemAreas.map((a) => (
          <AreaTable key={a.id} area={a} rows={data.systems[a.id]} cutoff={cutoff} />
        ))}
        {systemAreas.length === 0 && <p className="mb-6 text-neutral-600">Für diesen Kunden sind keine Systeme angelegt.</p>}

        {contracts.length > 0 && <ContractBlock rows={contracts} />}

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
          <span>Rot: EOL oder ohne Support · Gelb: Support endet bis {deDate(new Date(new Date(`${cutoff}T00:00:00`).getTime() - 86400000).toISOString().slice(0, 10))}</span>
        </footer>
      </article>
    </div>
  );
}

function AreaTable({ area, rows, cutoff }: { area: Area; rows: AreaRow[]; cutoff: string }) {
  const name = area.plural ?? area.title.replace(/^Übersicht /, "");
  const sorted = [...rows].sort((a, b) => (supportDate(a) || "9999").localeCompare(supportDate(b) || "9999"));
  return (
    <section className="mb-5" aria-label={name}>
      <h3 className="mb-1.5 border-b border-neutral-300 pb-1 text-sm font-semibold [break-after:avoid]">
        {name} <span className="font-normal text-neutral-500">({rows.length})</span>
      </h3>
      {/* Gleiche Spaltenbreiten in allen Tabellen, damit das Blatt ruhig wirkt */}
      <table className="w-full table-fixed border-collapse text-[9pt]">
        <colgroup>
          <col className="w-[10%]" />
          <col className="w-[22%]" />
          <col className="w-[18%]" />
          <col className="w-[22%]" />
          <col className="w-[12%]" />
          <col className="w-[6%]" />
          <col className="w-[10%]" />
        </colgroup>
        <thead>
          <tr className="text-left text-neutral-600">
            <th className="py-1 pr-2 font-medium">ID</th>
            <th className="py-1 pr-2 font-medium">Bezeichnung</th>
            <th className="py-1 pr-2 font-medium">Servicetag / Host</th>
            <th className="py-1 pr-2 font-medium">Details</th>
            <th className="py-1 pr-2 font-medium">{area.id === "oracle" ? "Pflege bis" : "Support bis"}</th>
            <th className="py-1 pr-2 font-medium">EOL</th>
            <th className="py-1 font-medium">Status</th>
          </tr>
        </thead>
        <tbody>
          {sorted.map((r) => {
            const st = state(r, cutoff);
            const notes = String(r.notes ?? "").trim();
            const tone = cn(st === "abgelaufen" && "text-red-700", st === "bald" && "bg-amber-50");
            return (
              <Fragment key={r.id}>
                <tr className={cn("border-t border-neutral-200 [break-inside:avoid]", tone)}>
                  <td className="py-1 pr-2 align-top tabular-nums">{r.id}</td>
                  <td className="break-words py-1 pr-2 align-top">{label(r) || "–"}</td>
                  <td className="break-words py-1 pr-2 align-top">{ident(r) || "–"}</td>
                  <td className="break-words py-1 pr-2 align-top">{details(area.id, r) || "–"}</td>
                  <td className="py-1 pr-2 align-top whitespace-nowrap tabular-nums">
                    {deDate(supportDate(r)) || "–"}
                    {r.supportSource ? <span className="text-[8pt] text-neutral-500"> (OS)</span> : null}
                  </td>
                  <td className="break-words py-1 pr-2 align-top">{String(r.eol ?? "") || "–"}</td>
                  <td className="py-1 align-top">{String(r.status ?? "") || "–"}</td>
                </tr>
                {/* Besonderheiten klein darunter, nur wenn vorhanden */}
                {notes && (
                  <tr className={cn("[break-inside:avoid]", tone)}>
                    <td />
                    <td colSpan={6} className="pb-1 pr-2 text-[8pt] text-neutral-600">
                      {notes}
                    </td>
                  </tr>
                )}
              </Fragment>
            );
          })}
        </tbody>
      </table>
    </section>
  );
}

/** Steht PLZ oder Ort schon in der Adresse (häufig „Straße, PLZ Ort“)? */
function placeIn(address: string, zip: string, city: string): boolean {
  const a = address.toLowerCase();
  return Boolean((zip && a.includes(zip.toLowerCase())) || (city && a.includes(city.toLowerCase())));
}

/** Ort ohne Doppelung zur Adresse, dazu das Land */
function placeLine(address: string, zip: string, city: string, country: string): string {
  const place = address && placeIn(address, zip, city) ? "" : [zip, city].filter(Boolean).join(" ");
  return [place, country].filter(Boolean).join(", ");
}

/** Oracle-ESL-Verträge des Kunden (dbo.Vertragsdaten): alle gefüllten Angaben */
function ContractBlock({ rows }: { rows: AreaRow[] }) {
  const area = AREAS["oracle-esl"];
  const fields = area.fields.filter((f) => f.key !== "company" && f.key !== "type");
  return (
    <section className="mb-6 [break-inside:avoid]" aria-label="Oracle-ESL-Vertrag">
      <h3 className="mb-1.5 border-b border-neutral-300 pb-1 text-sm font-semibold">
        Oracle-ESL-Vertrag {rows.length > 1 && <span className="font-normal text-neutral-500">({rows.length})</span>}
      </h3>
      {rows.map((r) => (
        <dl key={r.id} className="mb-2 grid grid-cols-[11rem_1fr_11rem_1fr] gap-x-3 gap-y-0.5 text-[9pt]">
          {fields
            .filter((f) => String(r[f.key] ?? "").trim())
            .map((f) => (
              <Fragment key={f.key}>
                <dt className="text-neutral-600">{f.label}</dt>
                <dd>{f.date ? deDate(String(r[f.key])) : String(r[f.key])}</dd>
              </Fragment>
            ))}
        </dl>
      ))}
    </section>
  );
}
