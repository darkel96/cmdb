/**
 * PMS-Module am Oracle-ESL-Vertrag (wie GAPTEQ): dbo.PMS_Module, Spalte ID = ID des Vertrags (Oracle-ESL),
 * Preise beim Anlegen aus der Preisliste dbo.PMS_Module_Stammdaten übernommen. Gemeinsam für Dienst und Frontend.
 */

/** Rechte: PMS-Module hängen an Oracle-ESL und folgen dessen Leserecht */
export const PMS_AREA = "oracle-esl";
/** Recht zum Hinzufügen, Ändern und Entfernen von Modulen (Rechte-Tabelle) */
export const PMS_WRITE = "pms-module";

/** Preise: Euro mit höchstens zwei Nachkommastellen, wie decimal(10,2) */
export const PMS_PRICE_MAX = 99_999_999.99;

export interface PmsPrices {
  listPrice: number | null;
  licenseCost: number | null;
  maintenanceCost: number | null;
}

/** Ein Modul an einem Vertrag (Preise dort gespeichert, können von der Preisliste abweichen) */
export interface PmsModule extends PmsPrices {
  id: number;
  contractId: number;
  module: string;
}

/** Eintrag der Preisliste */
export interface PmsPrice extends PmsPrices {
  module: string;
}

export interface PmsResponse {
  source: "db" | "test";
  items: PmsModule[];
  prices: PmsPrice[];
  /** Preisliste nicht lesbar (z. B. fehlendes Leserecht des Datenbank-Logins); Module gibt es trotzdem */
  pricesError?: string;
}

export const PMS_PRICE_COLUMNS: { key: keyof PmsPrices; label: string }[] = [
  { key: "listPrice", label: "PMS-Listenpreis" },
  { key: "licenseCost", label: "Oracle-Lizenzkosten" },
  { key: "maintenanceCost", label: "Oracle-Wartungskosten" },
];

export function pmsSum(items: PmsPrices[]): PmsPrices {
  const sum = (key: keyof PmsPrices) => items.reduce((s, i) => s + (i[key] ?? 0), 0);
  return { listPrice: sum("listPrice"), licenseCost: sum("licenseCost"), maintenanceCost: sum("maintenanceCost") };
}

const EURO = new Intl.NumberFormat("de-DE", { style: "currency", currency: "EUR" });

export const euro = (value: number | null) => (value === null ? "" : EURO.format(value));

/** Eingabe „25.000,00 €“, „25000,5“ oder „25000.50“ → Zahl; leer → null; ungültig → undefined */
export function parseEuro(text: string): number | null | undefined {
  let t = text.replace(/[€\s]/g, "");
  if (!t) return null;
  if (t.includes(",")) t = t.replace(/\./g, "").replace(",", ".");
  if (!/^\d+(\.\d{1,2})?$/.test(t)) return undefined;
  const value = Number(t);
  return value <= PMS_PRICE_MAX ? value : undefined;
}

/** Für Eingabefelder: 25000.5 → „25000,50“ */
export const euroInput = (value: number | null) => (value === null ? "" : value.toFixed(2).replace(".", ","));

/** Gleiche Preise (auf Cent), z. B. Stand beim Öffnen gegen Stand in der Datenbank */
export function samePrices(a: PmsPrices, b: PmsPrices): boolean {
  const cent = (v: number | null) => (v === null ? null : Math.round(v * 100));
  return PMS_PRICE_COLUMNS.every((c) => cent(a[c.key]) === cent(b[c.key]));
}
