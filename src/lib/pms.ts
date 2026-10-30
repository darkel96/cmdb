/**
 * PMS-Module am Oracle-ESL-Vertrag (wie GAPTEQ): dbo.PMS_Module, Spalte ID = ID des Vertrags (Oracle-ESL),
 * Preise beim Anlegen aus der Preisliste dbo.PMS_Module_Stammdaten übernommen. Gemeinsam für Dienst und Frontend.
 */

/** Rechte: PMS-Module hängen an Oracle-ESL und folgen dessen Leserecht */
export const PMS_AREA = "oracle-esl";

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
