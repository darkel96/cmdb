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
  /** Plural für Überschriften in der Kundenansicht, z. B. „Server“, „MDEs“ */
  plural?: string;
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

/** Kundenansicht: Stammdaten, Dokumente und alle Systeme des Kunden je Bereich */
export interface CustomerDocument {
  id: number;
  name: string;
  type: string;
}

export interface CustomerDetailResponse {
  customer: { id: number; name: string; country: string; city: string; zip: string; address: string; email: string };
  documents: CustomerDocument[];
  /** Hinweis, falls die Dokumente nicht gelesen werden konnten */
  documentsError?: string;
  /** Systeme je Bereich (nur Bereiche mit Einträgen) */
  systems: Record<string, AreaRow[]>;
  /** Bereiche, die nicht gelesen werden konnten (z. B. fehlendes Leserecht) */
  errors: Record<string, string>;
  source: "test" | "db";
}

/** Kunde anlegen bzw. bearbeiten */
export interface CustomerValuesRequest {
  values: { name: string; country: string; city: string; zip?: string; address?: string; email?: string };
}

export interface CustomerSaveResponse {
  id: number;
  /** Beim Umbenennen: in welchen Tabellen wie viele Einträge mitumbenannt wurden */
  renamed?: { label: string; count: number }[];
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
    plural: "Switche",
    typeValue: "Switch",
    createFields: ["company", "orderNumber", "supplier", "manufacturer", "model", "serviceTag", "lwlType", "supportUntil", "notes"],
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
  mde: {
    id: "mde",
    table: "MDE_manuell",
    title: "Übersicht MDEs",
    singular: "MDE",
    plural: "MDEs",
    typeValue: "MDE",
    createFields: ["company", "orderNumber", "supplier", "manufacturer", "serialNumber", "supportUntil", "notes"],
    testCount: 16,
    testIdBase: 30000,
    fields: [
      f.company,
      // Bei MDE sind Lieferant und Hersteller in GAPTEQ Freitext (im Hersteller steht meist das Gerät)
      { ...f.supplier, options: undefined, width: 170 },
      f.orderNumber,
      { ...f.manufacturer, options: undefined, width: 220 },
      { key: "serialNumber", column: "Seriennummer", label: "Seriennummer", width: 170 },
      f.supportUntil,
      f.notes,
      { ...f.type, detailOnly: false, width: 70 },
    ],
  },
  storage: {
    id: "storage",
    table: "Storage_manuell",
    title: "Übersicht Storage",
    singular: "Storage",
    typeValue: "Storage",
    createFields: ["company", "orderNumber", "supplier", "manufacturer", "model", "serviceTag", "maintenanceType", "diskType", "diskCount", "raid", "ipAddress", "subnet", "gateway", "supportUntil", "notes"],
    testCount: 14,
    testIdBase: 90000,
    fields: [
      { ...f.company, width: 170 },
      f.orderNumber,
      // Bei Storage ist der Lieferant in GAPTEQ Pflicht, der Hersteller Freitext und das Modell freiwillig
      { ...f.supplier, required: true, width: 120 },
      { ...f.manufacturer, options: undefined, width: 90 },
      { ...f.model, required: false, width: 170 },
      f.serviceTag,
      { key: "raid", column: "RAID", label: "RAID", width: 70, options: { table: "DD_RAID", column: "RAID" } },
      { key: "diskType", column: "Festplatten_Typ", label: "Festplatten-Typ", width: 120 },
      { key: "diskCount", column: "Anzahl_Festplatten", label: "Anzahl Festplatten", width: 110 },
      { key: "ipAddress", column: "IP_Adresse", label: "IP-Adresse", width: 130 },
      { key: "subnet", column: "Subnetz", label: "Subnetz", width: 120 },
      { key: "gateway", column: "Gateway", label: "Gateway", width: 120 },
      f.maintenanceType,
      f.supportUntil,
      f.notes,
      f.type,
      { ...f.eol, detailOnly: true },
      f.status,
    ],
  },
  client: {
    id: "client",
    table: "Client_manuell",
    title: "Übersicht Client",
    singular: "Client",
    typeValue: "Client",
    createFields: ["company", "orderNumber", "supplier", "manufacturer", "serviceTag", "monitor", "notes"],
    testCount: 20,
    testIdBase: 110000,
    fields: [
      f.company,
      f.supplier,
      f.orderNumber,
      // Bei Client ist der Hersteller in GAPTEQ Freitext (meist das Gerät)
      { ...f.manufacturer, options: undefined, width: 240 },
      f.serviceTag,
      { ...f.notes, width: 220 },
      { key: "monitor", column: "Monitor", label: "Monitor", detailOnly: true, options: { table: "DD_Client_Monitor", column: "Ja_Nein" } },
      f.type,
    ],
  },
  // Nur lesend. RMAN_Copy_Job_PW (Passwörter im Klartext) wird bewusst nie gelesen oder angezeigt.
  oracle: {
    id: "oracle",
    table: "Oracle_manuell",
    title: "Übersicht Oracle",
    singular: "Oracle",
    plural: "Oracle",
    typeValue: "Oracle",
    testCount: 12,
    testIdBase: 100000,
    fields: [
      f.company,
      { key: "dbType", column: "DB_Typ", label: "DB-Typ", width: 110 },
      { key: "dbVersion", column: "DB_Version", label: "DB-Version", width: 100 },
      { key: "os", column: "LinuxOS_WinOS", label: "Linux/Windows", width: 120 },
      { key: "hostname", column: "Hostname", label: "Hostname", width: 130 },
      { key: "charset", column: "Zeichensatz", label: "Zeichensatz", width: 100 },
      { key: "sga", column: "SGA", label: "SGA", width: 70 },
      { key: "pga", column: "PGA", label: "PGA", width: 70 },
      { key: "rmanCopyJob", column: "RMAN_Copy_Job", label: "RMAN-Copy-Job", width: 110 },
      { key: "rmanCopyJobPath", column: "RMAN_Copy_Job_Pfad", label: "RMAN-Pfad", width: 150 },
      { key: "rmanCopyJobUser", column: "RMAN_Copy_Job_Username", label: "RMAN-Benutzer", width: 110 },
      { key: "dnsServer", column: "DNS_Server", label: "DNS-Server", width: 130 },
      { key: "ipAddress", column: "IP_Adresse", label: "IP-Adresse", width: 120 },
      { key: "gateway", column: "Gateway", label: "Gateway", width: 120 },
      { key: "softwareContract", column: "Software_Pflegevertrag", label: "Softwarepflege", width: 110 },
      { key: "softwareContractEnd", column: "Software_pflegevertragsende", label: "Softwarepflege bis", date: true, width: 120 },
      { key: "itServiceContract", column: "IT_Servicevertrag", label: "IT-Servicevertrag", width: 120 },
      { key: "itServiceContractEnd", column: "IT_Servicevertragsende", label: "IT-Service bis", date: true, width: 110 },
      f.notes,
      f.type,
    ],
  },
  windows: {
    id: "windows",
    table: "Windowssysteme_manuell",
    title: "Übersicht Windows-Systeme",
    singular: "Windows-System",
    plural: "Windows-Systeme",
    typeValue: "Windows-System",
    testCount: 16,
    testIdBase: 120000,
    fields: [
      { ...f.type, detailOnly: false, width: 130 },
      f.company,
      { key: "function", column: "Funktion", label: "Funktion", width: 130 },
      { key: "hostname", column: "Hostname", label: "Hostname", width: 130 },
      { key: "ipAddress", column: "IP", label: "IP", width: 120 },
      { key: "subnet", column: "Subnetz", label: "Subnetz", width: 120 },
      { key: "gateway", column: "Gateway", label: "Gateway", width: 120 },
      { key: "os", column: "OS", label: "OS", width: 150 },
      { key: "wincc", column: "WinCC", label: "WinCC", width: 100 },
      { key: "hardware", column: "Hardware", label: "Hardware", width: 100 },
      { key: "providedBy", column: "Bereitgestellt", label: "Bereitgestellt", width: 100 },
      { key: "eol", column: "EOL", label: "EOL", width: 60 },
      f.notes,
      { ...f.supportUntil, detailOnly: true },
      f.status,
    ],
  },
  vmware: {
    id: "vmware",
    table: "VMware_manuell",
    title: "Übersicht VMware",
    singular: "VMware",
    typeValue: "VMware",
    testCount: 14,
    testIdBase: 40000,
    fields: [
      f.company,
      f.supplier,
      f.orderNumber,
      { key: "licenseType", column: "Lizenztyp", label: "Lizenztyp", width: 230 },
      { key: "licensee", column: "Lizenznehmer", label: "Lizenznehmer", width: 210 },
      { key: "license", column: "Lizenz", label: "Lizenz", width: 250 },
      f.supportUntil,
      f.notes,
      f.type,
      { ...f.eol, detailOnly: true },
      f.status,
    ],
  },
  veeam: {
    id: "veeam",
    table: "VEEAM_manuell",
    title: "Übersicht VEEAM",
    singular: "Veeam",
    plural: "Veeam",
    typeValue: "VEEAM",
    testCount: 13,
    testIdBase: 70000,
    fields: [
      f.company,
      f.supplier,
      f.orderNumber,
      { key: "licenseType", column: "Lizenztyp", label: "Lizenztyp", width: 240 },
      { key: "licensee", column: "Lizenznehmer", label: "Lizenznehmer", width: 220 },
      { key: "license", column: "Lizenz", label: "Lizenz", width: 260 },
      f.supportUntil,
      f.notes,
      f.type,
      { ...f.eol, detailOnly: true },
      f.status,
    ],
  },
  tsplus: {
    id: "tsplus",
    table: "TSPLUS_manuell",
    title: "Übersicht TSPLUS",
    singular: "TSPLUS",
    typeValue: "TSPLUS",
    testCount: 6,
    testIdBase: 50000,
    fields: [
      f.company,
      f.supplier,
      f.orderNumber,
      { key: "licenseType", column: "Lizenztyp", label: "Lizenztyp", width: 200 },
      { key: "license", column: "Lizenz", label: "Lizenz", width: 250 },
      { key: "licenseCount", column: "Anzahl_Lizenzen", label: "Anzahl Lizenzen", width: 120 },
      f.supportUntil,
      f.notes,
      f.type,
      { ...f.eol, detailOnly: true },
      f.status,
    ],
  },
  prtg: {
    id: "prtg",
    table: "PRTG_manuell",
    title: "Übersicht PRTG",
    singular: "PRTG",
    typeValue: "PRTG",
    testCount: 10,
    testIdBase: 60000,
    fields: [
      f.company,
      f.supplier,
      { key: "deliveredOn", column: "Lieferdatum", label: "Lieferdatum", date: true, width: 100 },
      f.orderNumber,
      { key: "sensorCount", column: "Anzahl_Sensoren", label: "Anzahl Sensoren", width: 120 },
      f.supportUntil,
      f.eol,
      { ...f.notes, width: 220 },
      f.type,
      f.status,
    ],
  },
  // Oracle-ESL (Embedded Software License) aus dbo.Vertragsdaten: Kunde statt Firma, keine Typ-Spalte
  "oracle-esl": {
    id: "oracle-esl",
    table: "Vertragsdaten",
    title: "Übersicht Oracle-ESL",
    singular: "Oracle-ESL",
    plural: "Oracle-ESL",
    typeValue: "Oracle-ESL",
    testCount: 7,
    testIdBase: 1000000,
    fields: [
      { ...f.company, column: "Kunde", label: "Kunde", width: 190 },
      { key: "sapProject", column: "SAP Projektnummer", label: "SAP-Projektnummer", width: 140 },
      { key: "oracleFrameworkContract", column: "Oracle Rahmenvertrag", label: "Oracle-Rahmenvertrag", width: 150 },
      { key: "oracleProjectSupportEnd", column: "Oracle Ende Projektsupport", label: "Oracle Ende Projektsupport", date: true, width: 120 },
      { key: "oracleLicenseReport", column: "Oracle Lizenzmeldung", label: "Oracle-Lizenzmeldung", width: 150 },
      { key: "oracleLicenseReportDate", column: "Oracle Lizenzmeldung Datum", label: "Lizenzmeldung Datum", date: true, width: 120 },
      { key: "csiNumber", column: "CSI-Nummer", label: "CSI-Nummer", width: 110 },
      { key: "oracleSupportContract", column: "Oracle Supportvertrag", label: "Oracle-Supportvertrag", width: 150 },
      { key: "oracleSupportStatus", column: "Oracle Supportvertrag Status", label: "Oracle-Support Status", width: 140 },
      { key: "oracleSupportUntil", column: "Oracle Supportvertrag Laufzeit", label: "Oracle-Support Laufzeit", date: true, width: 120 },
      { key: "hotlineStatus", column: "Kunde Hotlinevertrag Status", label: "Kunde Hotline Status", width: 140 },
      { key: "hotlineUntil", column: "Kunde Hotlinevertrag Laufzeit", label: "Kunde Hotline Laufzeit", date: true, width: 120 },
      { key: "hotlineSapOrder", column: "Kunde Hotlinevertrag SAP Auftragsnummer", label: "Kunde Hotline SAP-Auftrag", width: 150 },
      { key: "goLive", column: "GoLive Datum", label: "GoLive", date: true, width: 100 },
      { key: "costsBooked", column: "Kosten gebucht Datum", label: "Kosten gebucht", date: true, width: 110 },
      { key: "oracleSystem", column: "Oracle System", label: "Oracle-System", width: 150 },
    ],
  },
};
