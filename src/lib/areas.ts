/**
 * Bereiche der Seitenleiste mit Daten aus der bestehenden Datenbank (nur lesend).
 * Ein Bereich beschreibt Tabelle und Spalten; Übersicht, Öffnen, API und Testdaten entstehen daraus.
 * Spalten in der Reihenfolge der bisherigen GAPTEQ-Übersicht.
 */

export interface AreaField {
  /** Name im Programm und in der API */
  key: string;
  /** Spalte in der Datenbank */
  column: string;
  label: string;
  date?: boolean;
  /** Breite in der Übersicht (Pixel) */
  width?: number;
  /** Nur beim Öffnen anzeigen, nicht in der Übersicht */
  detailOnly?: boolean;
}

export interface Area {
  /** Teil der Adresse: /bereich/<id> */
  id: string;
  /** Tabelle im Schema dbo */
  table: string;
  title: string;
  /** Bezeichnung eines Eintrags, z. B. „Server“ */
  singular: string;
  fields: AreaField[];
  /** Testmodus: Anzahl und erste ID der erfundenen Einträge */
  testCount: number;
  testIdBase: number;
}

/** Ein Eintrag: ID plus Werte je Feld (Datum als JJJJ-MM-TT, leer als "") */
export type AreaRow = { id: number } & Record<string, string | number>;

export interface AreaListResponse {
  source: "test" | "db";
  items: AreaRow[];
}

const f = {
  company: { key: "company", column: "Firma", label: "Firma", width: 200 },
  supplier: { key: "supplier", column: "Lieferant", label: "Lieferant", width: 130 },
  orderNumber: { key: "orderNumber", column: "Bestellnummer", label: "Bestellnummer", width: 130 },
  manufacturer: { key: "manufacturer", column: "Hersteller", label: "Hersteller", width: 100 },
  model: { key: "model", column: "Modell", label: "Modell", width: 200 },
  serviceTag: { key: "serviceTag", column: "Servicetag", label: "Servicetag", width: 120 },
  supportUntil: { key: "supportUntil", column: "Support_bis", label: "Support bis", date: true, width: 100 },
  eol: { key: "eol", column: "EOL", label: "EOL", width: 60 },
  notes: { key: "notes", column: "Besonderheiten", label: "Besonderheiten", width: 160 },
  maintenanceType: { key: "maintenanceType", column: "Wartungstyp", label: "Wartungstyp", width: 130 },
  type: { key: "type", column: "Typ", label: "Typ", detailOnly: true },
  status: { key: "status", column: "Status", label: "Status", detailOnly: true },
} satisfies Record<string, AreaField>;

export const AREAS: Record<string, Area> = {
  server: {
    id: "server",
    table: "Server_manuell",
    title: "Übersicht Server",
    singular: "Server",
    testCount: 24,
    testIdBase: 10000,
    fields: [
      f.company,
      f.supplier,
      { key: "deliveredOn", column: "Lieferdatum", label: "Lieferdatum", date: true, width: 100 },
      f.orderNumber,
      f.manufacturer,
      { ...f.model, width: 180 },
      { key: "serverType", column: "Servertyp", label: "Servertyp", width: 140 },
      f.serviceTag,
      f.maintenanceType,
      f.supportUntil,
      f.eol,
      f.notes,
      f.type,
      f.status,
    ],
  },
  switche: {
    id: "switche",
    table: "Switche_manuell",
    title: "Übersicht Switche",
    singular: "Switch",
    testCount: 18,
    testIdBase: 20000,
    fields: [
      f.company,
      f.supplier,
      f.orderNumber,
      f.supportUntil,
      f.manufacturer,
      f.model,
      { key: "lwlType", column: "LWL_Typ", label: "LWL-Typ", width: 200 },
      f.serviceTag,
      f.notes,
      f.type,
      { ...f.eol, detailOnly: true },
      f.status,
    ],
  },
};
