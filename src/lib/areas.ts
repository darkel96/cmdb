/**
 * Bereiche der Seitenleiste mit Daten aus der bestehenden Datenbank (nur lesend).
 * Ein Bereich beschreibt Tabelle und Spalten; Übersicht, Öffnen, API und Testdaten entstehen daraus.
 * Spalten in allen Bereichen in derselben Reihenfolge (seit 11.11.2026, vorher wie GAPTEQ): Firma, was es ist
 * (Typ, Hersteller, Modell, Servicetag/Lizenz …), Technik, Beschaffung (Lieferant, Bestellnummer, Lieferdatum),
 * Vertrag und Support (Wartungstyp, Support bis, EOL), zuletzt Besonderheiten. Felder nur beim Öffnen stehen am Ende.
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
  /** Auswahlliste beim Anlegen: Kunden aus dbo.DS_Kunden, eine Listen-Tabelle (dbo.DD_* oder eigene in cmdb) oder die schon vorkommenden Werte der Spalte */
  options?: "customers" | "distinct" | { table: string; column: string; schema?: "dbo" | "cmdb" };
  /** Beschriftung im Formular, falls abweichend (wie in GAPTEQ) */
  formLabel?: string;
  /** Vorbelegung beim Anlegen */
  defaultValue?: string;
}

/**
 * Passwortspalte eines Bereichs (Oracle: RMAN_Copy_Job_PW). Steht bewusst nicht in fields: Übersicht, Detail, Export
 * und Kundenansicht enthalten sie nie. Lesen nur einzeln über /api/areas/<id>/<itemId>/secret mit dem Recht Bearbeiten.
 */
export interface AreaSecret {
  key: string;
  column: string;
  label: string;
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
  /** Überschrift des Formulars, falls abweichend von „Anlage <singular>“ (wie in GAPTEQ) */
  createTitle?: string;
  /** Feste Werte beim Anlegen, im Formular nur angezeigt (z. B. EOL „Nein“) */
  createFixed?: Record<string, string>;
  /** Felder im Formular „Anlage“ in derselben Reihenfolge wie die Spalten, Besonderheiten zuletzt; fehlt es, kann der Bereich nicht angelegt werden */
  createFields?: string[];
  /** Testmodus: Anzahl und erste ID der erfundenen Einträge */
  testCount: number;
  testIdBase: number;
  /** Passwortspalte, getrennt von fields (siehe AreaSecret) */
  secret?: AreaSecret;
  /** Schema der Tabelle; Standard dbo (bestehende GAPTEQ-Tabellen). Neue Bereiche liegen in cmdb. */
  schema?: "dbo" | "cmdb";
  /**
   * ID vergibt die Datenbank (IDENTITY ab dem Nummernkreis, z. B. 130000) statt vorab angelegter Leerzeilen wie in
   * GAPTEQ: Anlegen ist ein normales INSERT.
   */
  identity?: boolean;
  /** Felder nur beim Anlegen; beim Bearbeiten nur angezeigt (z. B. Kunde bei Oracle-ESL, wie GAPTEQ) */
  createOnly?: string[];
  /**
   * Feldgruppen mit eigenem Recht „Bearbeiten“ (wie die Rollen-Knöpfe in GAPTEQ, z. B. Einkauf, Service). In der
   * Rechte-Tabelle als „<Bereich> › <Gruppe>“; das Recht Bearbeiten des Bereichs selbst erlaubt alle Felder.
   */
  fieldGroups?: { id: string; label: string; fields: string[] }[];
  /**
   * Abschnitte im Formular (wie GAPTEQ); fehlt es, stehen alle Felder in einem Block. column: 2 = auf breiten
   * Bildschirmen in der rechten Spalte, damit das Formular ohne Scrollen auf eine Seite passt
   */
  formSections?: { label: string; fields: string[]; column?: 2 }[];
  /** Kein Löschen (z. B. Oracle-ESL: kein DELETE auf dbo.Vertragsdaten freigegeben) */
  noDelete?: boolean;
  /** Keine Dokumente am Eintrag */
  noDocuments?: boolean;
}

/** Recht einer Feldgruppe, z. B. „oracle-esl.einkauf“ */
export const groupPermission = (area: Area, groupId: string) => `${area.id}.${groupId}`;

/**
 * Felder, die jemand beim Bearbeiten ändern darf: mit dem Recht Bearbeiten des Bereichs alle aus dem Formular
 * (ohne createOnly), sonst die der Feldgruppen, für die das Recht Bearbeiten besteht. Leer: kein Bearbeiten.
 */
export function editableFields(area: Area, can: (area: string, action: "edit") => boolean): string[] {
  const all = (area.createFields ?? []).filter((k) => !area.createOnly?.includes(k));
  if (can(area.id, "edit")) return all;
  const allowed = new Set((area.fieldGroups ?? []).filter((g) => can(groupPermission(area, g.id), "edit")).flatMap((g) => g.fields));
  return all.filter((k) => allowed.has(k));
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
  // Lieferant als Freitext (bei den Software- und Lizenzbereichen in GAPTEQ ohne Auswahlliste)
  supplierText: { key: "supplier", column: "Lieferant", label: "Lieferant", width: 130 },
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

/** Status bei auslaufenden Systemen, Auswahl wie in GAPTEQ (Spalte „Status“ der Bereichstabellen) */
export const SYSTEM_STATUS = ["Angeboten", "In Bearbeitung", "Verlängert", "Abgeschlossen"];

/**
 * Nummernkreis wie in GAPTEQ: immer die kleinste freie Nummer ab dem Anfang des Bereichs (testIdBase), auch wenn
 * dahinter schon Nummern belegt sind. Für Testmodus und Testseite; in der Datenbank entspricht das der ersten
 * vorab angelegten Leerzeile (server/src/db.ts, createAreaRow).
 */
export function firstFreeId(area: Area, used: number[]): number {
  const taken = new Set(used);
  let id = area.testIdBase;
  while (taken.has(id)) id++;
  return id;
}

export const AREAS: Record<string, Area> = {
  server: {
    id: "server",
    table: "Server_manuell",
    title: "Übersicht Server",
    singular: "Server",
    typeValue: "Server",
    createFields: ["company", "manufacturer", "model", "serviceTag", "serverType", "supplier", "orderNumber", "deliveredOn", "maintenanceType", "supportUntil", "eol", "notes"],
    testCount: 24,
    testIdBase: 10000,
    fields: [
      f.company,
      f.manufacturer,
      { ...f.model, width: 180 },
      f.serviceTag,
      { key: "serverType", column: "Servertyp", label: "Servertyp", width: 140, required: true, options: { table: "DD_Servertyp", column: "Servertyp" } },
      f.supplier,
      f.orderNumber,
      { key: "deliveredOn", column: "Lieferdatum", label: "Lieferdatum", date: true, width: 100 },
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
    createFields: ["company", "manufacturer", "model", "serviceTag", "lwlType", "supplier", "orderNumber", "supportUntil", "notes"],
    testCount: 18,
    testIdBase: 20000,
    fields: [
      f.company,
      f.manufacturer,
      f.model,
      f.serviceTag,
      { key: "lwlType", column: "LWL_Typ", label: "LWL-Typ", width: 200 },
      f.supplier,
      f.orderNumber,
      f.supportUntil,
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
    createFields: ["company", "manufacturer", "serialNumber", "supplier", "orderNumber", "supportUntil", "notes"],
    testCount: 16,
    testIdBase: 30000,
    fields: [
      f.company,
      { ...f.type, detailOnly: false, width: 70 },
      { ...f.manufacturer, options: undefined, width: 220 },
      { key: "serialNumber", column: "Seriennummer", label: "Seriennummer", width: 170 },
      // Bei MDE sind Lieferant und Hersteller in GAPTEQ Freitext (im Hersteller steht meist das Gerät)
      { ...f.supplier, options: undefined, width: 170 },
      f.orderNumber,
      f.supportUntil,
      f.notes,
    ],
  },
  storage: {
    id: "storage",
    table: "Storage_manuell",
    title: "Übersicht Storage",
    singular: "Storage",
    typeValue: "Storage",
    createFields: ["company", "manufacturer", "model", "serviceTag", "raid", "diskType", "diskCount", "ipAddress", "subnet", "gateway", "supplier", "orderNumber", "maintenanceType", "supportUntil", "notes"],
    testCount: 14,
    testIdBase: 90000,
    fields: [
      { ...f.company, width: 170 },
      { ...f.manufacturer, options: undefined, width: 90 },
      { ...f.model, required: false, width: 170 },
      f.serviceTag,
      { key: "raid", column: "RAID", label: "RAID", width: 70, options: { table: "DD_RAID", column: "RAID" } },
      { key: "diskType", column: "Festplatten_Typ", label: "Festplatten-Typ", width: 120 },
      { key: "diskCount", column: "Anzahl_Festplatten", label: "Anzahl Festplatten", width: 110 },
      { key: "ipAddress", column: "IP_Adresse", label: "IP-Adresse", width: 130 },
      { key: "subnet", column: "Subnetz", label: "Subnetz", width: 120 },
      { key: "gateway", column: "Gateway", label: "Gateway", width: 120 },
      // Bei Storage ist der Lieferant in GAPTEQ Pflicht, der Hersteller Freitext und das Modell freiwillig
      { ...f.supplier, required: true, width: 120 },
      f.orderNumber,
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
    createFields: ["company", "manufacturer", "serviceTag", "supplier", "orderNumber", "monitor", "notes"],
    testCount: 20,
    testIdBase: 110000,
    fields: [
      f.company,
      // Bei Client ist der Hersteller in GAPTEQ Freitext (meist das Gerät)
      { ...f.manufacturer, options: undefined, width: 240 },
      f.serviceTag,
      f.supplier,
      f.orderNumber,
      { ...f.notes, width: 220 },
      { key: "monitor", column: "Monitor", label: "Monitor", detailOnly: true, options: { table: "DD_Client_Monitor", column: "Ja_Nein" } },
      f.type,
    ],
  },
  oracle: {
    id: "oracle",
    table: "Oracle_manuell",
    title: "Übersicht Oracle",
    singular: "Oracle",
    plural: "Oracle",
    typeValue: "Oracle",
    // RMAN_Copy_Job_PW nur als secret: nie in Listen, Anzeigen mit Klick und Recht Bearbeiten
    createFields: ["company", "dbType", "dbVersion", "os", "hostname", "ipAddress", "gateway", "dnsServer", "ntp", "charset", "sga", "pga", "rmanCopyJob", "rmanCopyJobPath", "rmanCopyJobUser", "rmanPassword", "softwareContract", "softwareContractEnd", "itServiceContract", "itServiceContractEnd", "notes"],
    secret: { key: "rmanPassword", column: "RMAN_Copy_Job_PW", label: "RMAN-Passwort" },
    testCount: 12,
    testIdBase: 100000,
    fields: [
      f.company,
      { key: "dbType", column: "DB_Typ", label: "DB-Typ", width: 110, required: true, options: { table: "DD_DB_Typ", column: "DB_Typ" } },
      { key: "dbVersion", column: "DB_Version", label: "DB-Version", width: 100 },
      { key: "os", column: "LinuxOS_WinOS", label: "Linux/Windows", width: 120 },
      { key: "hostname", column: "Hostname", label: "Hostname", width: 130 },
      { key: "ipAddress", column: "IP_Adresse", label: "IP-Adresse", width: 120 },
      { key: "gateway", column: "Gateway", label: "Gateway", width: 120 },
      { key: "dnsServer", column: "DNS_Server", label: "DNS-Server", width: 130 },
      // Spalte NTP gibt es erst seit 13.11.2026 (vom DBA ergänzt, siehe docs/server.md)
      { key: "ntp", column: "NTP", label: "NTP-Server", width: 130 },
      { key: "charset", column: "Zeichensatz", label: "Zeichensatz", width: 100, options: { table: "DD_Zeichensatz", column: "Zeichensatz" } },
      { key: "sga", column: "SGA", label: "SGA", width: 70 },
      { key: "pga", column: "PGA", label: "PGA", width: 70 },
      { key: "rmanCopyJob", column: "RMAN_Copy_Job", label: "RMAN-Copy-Job", width: 110, required: true, options: { table: "DD_Ja_Nein", column: "Ja_Nein" } },
      { key: "rmanCopyJobPath", column: "RMAN_Copy_Job_Pfad", label: "RMAN-Pfad", width: 150 },
      { key: "rmanCopyJobUser", column: "RMAN_Copy_Job_Username", label: "RMAN-Benutzer", width: 110 },
      { key: "softwareContract", column: "Software_Pflegevertrag", label: "Softwarepflege", width: 110, required: true, options: { table: "DD_Ja_Nein", column: "Ja_Nein" } },
      { key: "softwareContractEnd", column: "Software_pflegevertragsende", label: "Softwarepflege bis", date: true, width: 120 },
      { key: "itServiceContract", column: "IT_Servicevertrag", label: "IT-Servicevertrag", width: 120, required: true, options: { table: "DD_Ja_Nein", column: "Ja_Nein" } },
      { key: "itServiceContractEnd", column: "IT_Servicevertragsende", label: "IT-Service bis", date: true, width: 110 },
      f.notes,
      f.type,
    ],
  },
  windows: {
    id: "windows",
    table: "Windowssysteme_manuell",
    // Seit 11.11.2026 „Virtuelle Maschinen“; Tabelle und Typ-Wert bleiben wie in GAPTEQ
    title: "Übersicht Virtuelle Maschinen",
    singular: "Virtuelle Maschine",
    plural: "Virtuelle Maschinen",
    typeValue: "Windows-System",
    createFields: ["company", "function", "hostname", "ipAddress", "subnet", "gateway", "os", "wincc", "hardware", "providedBy", "notes"],
    createFixed: { eol: "Nein" },
    testCount: 16,
    testIdBase: 120000,
    fields: [
      f.company,
      { ...f.type, detailOnly: false, width: 130 },
      { key: "function", column: "Funktion", label: "Funktion", formLabel: "Servertyp", width: 130, required: true, options: { schema: "cmdb", table: "VmServertyp", column: "Servertyp" } },
      { key: "hostname", column: "Hostname", label: "Hostname", width: 130 },
      { key: "ipAddress", column: "IP", label: "IP-Adresse", width: 120 },
      { key: "subnet", column: "Subnetz", label: "Subnetz", width: 120 },
      { key: "gateway", column: "Gateway", label: "Gateway", width: 120 },
      { key: "os", column: "OS", label: "OS", width: 150, options: { table: "DD_FW_Server_OS", column: "Server_OS" } },
      { key: "wincc", column: "WinCC", label: "WinCC", width: 100 },
      { key: "hardware", column: "Hardware", label: "Hardware", width: 100, options: "distinct" },
      { key: "providedBy", column: "Bereitgestellt", label: "Bereitgestellt", width: 100, options: "distinct" },
      // Ohne eigenes Datum: LTS-Ende des Betriebssystems (Stammdaten › Server-OS)
      { ...f.supportUntil },
      { key: "eol", column: "EOL", label: "EOL", width: 60 },
      f.notes,
      f.status,
    ],
  },
  vmware: {
    id: "vmware",
    table: "VMware_manuell",
    // Seit 11.11.2026 mit Zusatz „Lizenzen“ (wie Windows-Lizenzen); Typ-Wert bleibt wie in GAPTEQ
    title: "Übersicht VMware-Lizenzen",
    singular: "VMware-Lizenz",
    plural: "VMware-Lizenzen",
    typeValue: "VMware",
    createFields: ["company", "licenseType", "license", "licensee", "supplier", "orderNumber", "supportUntil", "notes"],
    testCount: 14,
    testIdBase: 40000,
    fields: [
      f.company,
      { key: "licenseType", column: "Lizenztyp", label: "Lizenztyp", width: 230 },
      { key: "license", column: "Lizenz", label: "Lizenz", width: 250 },
      { key: "licensee", column: "Lizenznehmer", label: "Lizenznehmer", width: 210 },
      f.supplierText,
      f.orderNumber,
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
    title: "Übersicht Veeam-Lizenzen",
    singular: "Veeam-Lizenz",
    plural: "Veeam-Lizenzen",
    typeValue: "VEEAM",
    createFields: ["company", "licenseType", "license", "licensee", "supplier", "orderNumber", "supportUntil", "notes"],
    createTitle: "Anlage Veeam-Lizenz",
    testCount: 13,
    testIdBase: 70000,
    fields: [
      f.company,
      { key: "licenseType", column: "Lizenztyp", label: "Lizenztyp", width: 240 },
      { key: "license", column: "Lizenz", label: "Lizenz", width: 260 },
      { key: "licensee", column: "Lizenznehmer", label: "Lizenznehmer", width: 220 },
      f.supplierText,
      f.orderNumber,
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
    createFields: ["company", "licenseType", "license", "licenseCount", "supplier", "orderNumber", "supportUntil", "notes"],
    testCount: 6,
    testIdBase: 50000,
    fields: [
      f.company,
      { key: "licenseType", column: "Lizenztyp", label: "Lizenztyp", width: 200 },
      { key: "license", column: "Lizenz", label: "Lizenz", width: 250 },
      { key: "licenseCount", column: "Anzahl_Lizenzen", label: "Anzahl Lizenzen", width: 120 },
      f.supplierText,
      f.orderNumber,
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
    createFields: ["company", "sensorCount", "supplier", "orderNumber", "deliveredOn", "supportUntil", "eol", "notes"],
    testCount: 10,
    testIdBase: 60000,
    fields: [
      f.company,
      { key: "sensorCount", column: "Anzahl_Sensoren", label: "Anzahl Sensoren", width: 120 },
      f.supplierText,
      f.orderNumber,
      { key: "deliveredOn", column: "Lieferdatum", label: "Lieferdatum", date: true, width: 100 },
      f.supportUntil,
      f.eol,
      { ...f.notes, width: 220 },
      f.type,
      f.status,
    ],
  },
  // KEPware-Lizenzen (OPC-Server): erster Bereich im Schema cmdb, Nummernkreis ab 130000 (server/migrations/002_kepware.sql)
  kepware: {
    id: "kepware",
    table: "KEPware",
    schema: "cmdb",
    identity: true,
    title: "Übersicht KEPware",
    singular: "KEPware-Lizenz",
    plural: "KEPware",
    typeValue: "KEPware",
    createTitle: "Anlage KEPware-Lizenz",
    createFields: ["company", "product", "version", "licenseKey", "emergencyKey", "licensee", "hostname", "supplier", "orderNumber", "deliveredOn", "supportUntil", "eol", "notes"],
    secret: { key: "emergencyKey", column: "Notfallkey", label: "Notfall-Key" },
    testCount: 8,
    testIdBase: 130000,
    fields: [
      f.company,
      { key: "product", column: "Produkt", label: "Produkt/Edition", width: 220, required: true },
      { key: "version", column: "Version", label: "Version", width: 90 },
      { key: "licenseKey", column: "Lizenzkey", label: "Lizenzkey", width: 220 },
      { key: "licensee", column: "Lizenznehmer", label: "Lizenznehmer", width: 180 },
      { key: "hostname", column: "Hostname", label: "Server/Hostname", width: 140 },
      f.supplierText,
      f.orderNumber,
      { key: "deliveredOn", column: "Lieferdatum", label: "Lieferdatum", date: true, width: 100 },
      f.supportUntil,
      f.eol,
      { ...f.notes, width: 200 },
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
    // dbo.Vertragsdaten hat IDENTITY: Anlegen ist ein INSERT, Löschen ein DELETE nur ohne PMS-Module (freigegeben 30.10.2026)
    identity: true,
    noDocuments: true,
    createOnly: ["company"],
    createFields: [
      "company", "sapProject", "goLive",
      "oracleFrameworkContract", "oracleProjectSupportEnd", "oracleLicenseReport", "oracleLicenseReportDate", "csiNumber", "costsBooked",
      "hotlineSapOrder", "hotlineStatus", "hotlineUntil",
      "oracleSupportContract", "oracleSupportStatus", "oracleSupportUntil",
    ],
    // Nach Zuständigkeit (Feldgruppen): Projektleitung, Einkauf (Lizenz und Support), Service, Buchhaltung;
    // je Zeile zusammengehörige Felder (Lizenzmeldung neben ihrem Datum)
    formSections: [
      { label: "Grunddaten", fields: ["company", "sapProject", "goLive"] },
      { label: "Oracle-Lizenzdaten", fields: ["oracleFrameworkContract", "csiNumber", "oracleProjectSupportEnd", "oracleLicenseReport", "oracleLicenseReportDate"] },
      { label: "Oracle-Supportvertrag", fields: ["oracleSupportContract", "oracleSupportStatus", "oracleSupportUntil"], column: 2 },
      { label: "Kunden-Hotlinevertrag", fields: ["hotlineSapOrder", "hotlineStatus", "hotlineUntil"], column: 2 },
      { label: "Buchhaltung", fields: ["costsBooked"], column: 2 },
    ],
    // Wie die Rollen-Knöpfe in GAPTEQ; „Administrator“ ist das Recht Bearbeiten von Oracle-ESL selbst
    fieldGroups: [
      { id: "projektleitung", label: "Projektleitung", fields: ["sapProject", "goLive"] },
      {
        id: "einkauf",
        label: "Einkauf",
        fields: ["oracleFrameworkContract", "oracleProjectSupportEnd", "oracleLicenseReport", "oracleLicenseReportDate", "csiNumber", "oracleSupportContract", "oracleSupportStatus", "oracleSupportUntil"],
      },
      { id: "service", label: "Service", fields: ["hotlineSapOrder", "hotlineStatus", "hotlineUntil"] },
      { id: "buchhaltung", label: "Buchhaltung", fields: ["costsBooked"] },
    ],
    fields: [
      { ...f.company, column: "Kunde", label: "Kunde", width: 190 },
      { key: "sapProject", column: "SAP Projektnummer", label: "SAP-Projektnummer", width: 140 },
      { key: "goLive", column: "GoLive Datum", label: "GoLive", date: true, width: 100 },
      { key: "oracleFrameworkContract", column: "Oracle Rahmenvertrag", label: "Oracle-Rahmenvertrag", width: 150 },
      { key: "csiNumber", column: "CSI-Nummer", label: "CSI-Nummer", width: 110 },
      { key: "oracleProjectSupportEnd", column: "Oracle Ende Projektsupport", label: "Oracle Ende Projektsupport", date: true, width: 120 },
      { key: "oracleLicenseReport", column: "Oracle Lizenzmeldung", label: "Oracle-Lizenzmeldung", width: 150 },
      { key: "oracleLicenseReportDate", column: "Oracle Lizenzmeldung Datum", label: "Lizenzmeldung Datum", date: true, width: 120 },
      { key: "oracleSupportContract", column: "Oracle Supportvertrag", label: "Oracle-Supportvertrag", formLabel: "Supportvertrag", width: 150 },
      { key: "oracleSupportStatus", column: "Oracle Supportvertrag Status", label: "Oracle-Support Status", formLabel: "Status", width: 140, options: { table: "DD_OracleVertragsdaten", column: "Status" } },
      { key: "oracleSupportUntil", column: "Oracle Supportvertrag Laufzeit", label: "Oracle-Support Laufzeit", formLabel: "Laufzeit", date: true, width: 120 },
      { key: "hotlineSapOrder", column: "Kunde Hotlinevertrag SAP Auftragsnummer", label: "Kunde Hotline SAP-Auftrag", formLabel: "SAP-Auftragsnummer", width: 150 },
      { key: "hotlineStatus", column: "Kunde Hotlinevertrag Status", label: "Kunde Hotline Status", formLabel: "Status", width: 140, options: { table: "DD_OracleVertragsdaten", column: "Status" } },
      { key: "hotlineUntil", column: "Kunde Hotlinevertrag Laufzeit", label: "Kunde Hotline Laufzeit", formLabel: "Laufzeit", date: true, width: 120 },
      { key: "costsBooked", column: "Kosten gebucht Datum", label: "Kosten gebucht", formLabel: "Kosten gebucht am", date: true, width: 110 },
      { key: "oracleSystem", column: "Oracle System", label: "Oracle-System", width: 150 },
    ],
  },
  lizenzen: {
    id: "lizenzen",
    table: "Lizenzen_manuell",
    title: "Übersicht Windows-Lizenzen",
    singular: "Lizenz",
    plural: "Windows-Lizenzen",
    typeValue: "Lizenz",
    createTitle: "Anlage Windows-Lizenzen",
    createFields: ["company", "licenseType", "license", "licensee", "supplier", "orderNumber", "supportUntil", "notes"],
    testCount: 12,
    testIdBase: 80000,
    fields: [
      f.company,
      { key: "licenseType", column: "Lizenztyp", label: "Lizenztyp", width: 240 },
      { key: "license", column: "Lizenz", label: "Lizenz", width: 260 },
      { key: "licensee", column: "Lizenznehmer", label: "Lizenznehmer", width: 220 },
      f.supplierText,
      f.orderNumber,
      f.supportUntil,
      f.notes,
      f.type,
    ],
  },
};
