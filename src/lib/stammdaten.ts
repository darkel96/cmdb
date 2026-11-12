/** Stammdaten: Auswahllisten aus den DD_*-Tabellen (wie GAPTEQ › Stammdaten), gemeinsam für Dienst und Frontend */

export interface LookupList {
  /** Teil der Adresse: /api/stammdaten/<id> */
  id: string;
  label: string;
  /** Schema der Tabelle, ohne Angabe dbo (GAPTEQ-Listen); eigene Listen der CMDB liegen in cmdb */
  schema?: "dbo" | "cmdb";
  table: string;
  column: string;
  /** Länge der Spalte in der Datenbank */
  maxLength: number;
  /** Schlüssel der Testdaten (TEST_OPTIONS) */
  testKey: string;
}

export const LOOKUP_LISTS: LookupList[] = [
  { id: "db-typ", label: "DB-Typ", table: "DD_DB_Typ", column: "DB_Typ", maxLength: 100, testKey: "dbType" },
  { id: "hersteller", label: "Hersteller", table: "DD_Hersteller", column: "Hersteller", maxLength: 50, testKey: "manufacturer" },
  { id: "lieferant", label: "Lieferant", table: "DD_Lieferant", column: "Lieferant", maxLength: 100, testKey: "supplier" },
  { id: "raid", label: "RAID", table: "DD_RAID", column: "RAID", maxLength: 50, testKey: "raid" },
  { id: "servertyp", label: "Servertyp", table: "DD_Servertyp", column: "Servertyp", maxLength: 50, testKey: "serverType" },
  { id: "vm-servertyp", label: "Servertyp (Virtuelle Maschinen)", schema: "cmdb", table: "VmServertyp", column: "Servertyp", maxLength: 255, testKey: "function" },
  { id: "vertragstyp", label: "Vertragstyp (Wartungstyp)", table: "DD_Vertragstyp", column: "Vertragstyp", maxLength: 100, testKey: "maintenanceType" },
  { id: "zeichensatz", label: "Zeichensatz", table: "DD_Zeichensatz", column: "Zeichensatz", maxLength: 50, testKey: "charset" },
  { id: "oracle-vertragsstatus", label: "Oracle-Vertragsstatus", table: "DD_OracleVertragsdaten", column: "Status", maxLength: 50, testKey: "contractStatus" },
  { id: "server-os", label: "Server-OS", table: "DD_FW_Server_OS", column: "Server_OS", maxLength: 255, testKey: "os" },
];

/** Tabelle einer Liste mit Schema, z. B. „dbo.DD_Servertyp“ oder „cmdb.VmServertyp“ */
export const listTable = (l: { schema?: "dbo" | "cmdb"; table: string }) => `${l.schema ?? "dbo"}.${l.table}`;

/** Liste der Stammdaten zu einer Auswahl im Formular (gleiche Tabelle) */
export const listOfOption = (options: unknown) =>
  typeof options === "object" && options ? LOOKUP_LISTS.find((l) => listTable(l) === listTable(options as { table: string; schema?: "dbo" | "cmdb" })) : undefined;

export interface StammdatenResponse {
  lists: { id: string; label: string; maxLength: number; values: string[]; error?: string }[];
}

/** Preisliste der PMS-Module: unter Stammdaten wie eine Liste, aber mit Preisen (eigene Tabelle, siehe lib/pms.ts) */
export const PMS_PRICE_LIST = { id: "pms-modularten", label: "PMS-Modularten" };

/** Alle Listen unter Verwaltung › Stammdaten, je mit eigenem Recht in der Rechte-Tabelle */
export const STAMMDATEN_LISTS: { id: string; label: string }[] = [...LOOKUP_LISTS, PMS_PRICE_LIST];

/** Recht für eine einzelne Liste, z. B. „stammdaten.hersteller“ */
export const listPermission = (listId: string) => `stammdaten.${listId}`;

/** Eine Liste ändern: Recht der Stammdaten insgesamt (alle Listen) oder dieser einen Liste */
export function canChangeList(can: (area: string, action: "create" | "edit" | "delete") => boolean, listId: string, action: "create" | "edit" | "delete"): boolean {
  return can("stammdaten", action) || can(listPermission(listId), action);
}
