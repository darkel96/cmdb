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
  /** Pflichtfeld beim Anlegen */
  required?: boolean;
  /** Auswahlliste beim Anlegen: Kunden aus dbo.DS_Kunden oder eine DD_*-Tabelle */
  options?: "customers" | { table: string; column: string };
  /** Vorbelegung beim Anlegen */
  defaultValue?: string;
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
  /** Wert der Spalte Typ bei neuen Einträgen (wie in GAPTEQ, z. B. „Server“) */
  typeValue: string;
  /** Felder im Formular „Anlage“ in der Reihenfolge wie in GAPTEQ; fehlt es, kann der Bereich nicht angelegt werden */
  createFields?: string[];
  /** Testmodus: Anzahl und erste ID der erfundenen Einträge */
  testCount: number;
  testIdBase: number;
}

/** Ein Eintrag: ID plus Werte je Feld (Datum als JJJJ-MM-TT, leer als "") */
export type AreaRow = { id: number } & Record<string, string | number>;

/** Neuer Eintrag: Werte je Feld (Datum als JJJJ-MM-TT, leer = nicht gesetzt) */
export interface AreaCreateRequest {
  values: Record<string, string>;
}

export interface AreaCreateResponse {
  id: number;
}

/** Daten für das Formular „Anlage“: voraussichtliche nächste ID und Auswahllisten je Feld */
export interface AreaFormResponse {
  nextId: number | null;
  options: Record<string, string[]>;
}

export interface AreaListResponse {
  source: "test" | "db";
  items: AreaRow[];
}

const f = {
  company: { key: "company", column: "Firma", label: "Firma", width: 200, required: true, options: "customers" },
  supplier: { key: "supplier", column: "Lieferant", label: "Lieferant", width: 130, options: { table: "DD_Lieferant", column: "Lieferant" } },
  orderNumber: { key: "orderNumber", column: "Bestellnummer", label: "Bestellnummer", width: 130 },
  manufacturer: { key: "manufacturer", column: "Hersteller", label: "Hersteller", width: 100, required: true, options: { table: "DD_Hersteller", column: "Hersteller" } },
  model: { key: "model", column: "Modell", label: "Modell", width: 200, required: true },
  serviceTag: { key: "serviceTag", column: "Servicetag", label: "Servicetag", width: 120 },
  supportUntil: { key: "supportUntil", column: "Support_bis", label: "Support bis", date: true, width: 100 },
  eol: { key: "eol", column: "EOL", label: "EOL", width: 60, options: { table: "DD_Ja_Nein", column: "Ja_Nein" }, defaultValue: "Nein" },
  notes: { key: "notes", column: "Besonderheiten", label: "Besonderheiten", width: 160 },
  maintenanceType: { key: "maintenanceType", column: "Wartungstyp", label: "Wartungstyp", width: 130, options: { table: "DD_Vertragstyp", column: "Vertragstyp" } },
  type: { key: "type", column: "Typ", label: "Typ", detailOnly: true },
  status: { key: "status", column: "Status", label: "Status", detailOnly: true },
} satisfies Record<string, AreaField>;

export const AREAS: Record<string, Area> = {
  server: {
    id: "server",
    table: "Server_manuell",
    title: "Übersicht Server",
    singular: "Server",
    typeValue: "Server",
    createFields: ["company", "orderNumber", "supplier", "deliveredOn", "manufacturer", "model", "serverType", "serviceTag", "maintenanceType", "supportUntil", "eol", "notes"],
    testCount: 24,
    testIdBase: 10000,
    fields: [
      f.company,
      f.supplier,
      { key: "deliveredOn", column: "Lieferdatum", label: "Lieferdatum", date: true, width: 100 },
      f.orderNumber,
      f.manufacturer,
      { ...f.model, width: 180 },
      { key: "serverType", column: "Servertyp", label: "Servertyp", width: 140, required: true, options: { table: "DD_Servertyp", column: "Servertyp" } },
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
    typeValue: "Switch",
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
