/**
 * Erfundene Daten für den Testmodus (Dienst mit CMDB_TESTMODE=1 und GitHub Pages).
 * Keine echten Hostnamen, IP-Adressen, Firmen oder Personen.
 */
import type { Area, AreaRow } from "./areas";
import type { ConfigurationItem, Customer, SessionUser } from "./types";

export const TEST_PASSWORD = "test";

export const TEST_USERS: Record<string, SessionUser> = {
  admin: { username: "admin", displayName: "Test Admin", mail: "admin@example.com", role: "admin" },
  user: { username: "user", displayName: "Test Benutzer", mail: "user@example.com", role: "user" },
};

export const TEST_CIS: ConfigurationItem[] = [
  { id: 1, name: "srv-demo-01", type: "Server", company: "Beispiel AG", manufacturer: "Hersteller A", model: "Rack 2U", status: "Aktiv", supportUntil: "2027-03-31" },
  { id: 2, name: "srv-demo-02", type: "Server", company: "Beispiel AG", manufacturer: "Hersteller A", model: "Rack 1U", status: "Aktiv", supportUntil: "2026-12-15" },
  { id: 3, name: "sto-demo-01", type: "Storage", company: "Muster GmbH", manufacturer: "Hersteller B", model: "Array 24", status: "Aktiv", supportUntil: "2028-06-30" },
  { id: 4, name: "sw-demo-core", type: "Switch", company: "Muster GmbH", manufacturer: "Hersteller C", model: "48 Port", status: "Aktiv", supportUntil: "2027-09-30" },
  { id: 5, name: "fw-demo-01", type: "Firewall", company: "Beispiel AG", manufacturer: "Hersteller D", model: "Edge 100", status: "Geplant", supportUntil: "2029-01-31" },
  { id: 6, name: "db-demo-ora", type: "Datenbank", company: "Demo KG", manufacturer: "Hersteller E", model: "Enterprise 19", status: "Aktiv", supportUntil: "2027-04-30" },
  { id: 7, name: "mde-demo-07", type: "MDE", company: "Demo KG", manufacturer: "Hersteller F", model: "Scanner X", status: "Ausser Betrieb", supportUntil: "2025-12-31" },
  { id: 8, name: "lic-demo-backup", type: "Lizenz", company: "Muster GmbH", manufacturer: "Hersteller G", model: "Backup Suite", status: "Aktiv", supportUntil: "2027-01-31" },
];

const COMPANY_PARTS = ["Beispiel", "Muster", "Demo", "Test", "Probe", "Vorlage", "Modell", "Schema"];
const COMPANY_FORMS = ["AG", "GmbH", "KG", "GmbH & Co. KG", "SE"];
const CITIES = ["Nordstadt", "Südheim", "Westdorf", "Ostfeld", "Bergtal", "Seeburg", "Waldau", "Flussingen", "Hafenstadt", "Talheim"];

/** 42 erfundene Kunden; Namen und Orte sind ausgedacht */
export const TEST_COUNTRIES = ["Deutschland", "Österreich", "Schweiz", "Polen"];

export const TEST_CUSTOMERS: Customer[] = Array.from({ length: 42 }, (_, i) => ({
  id: i + 1,
  name: `${COMPANY_PARTS[i % COMPANY_PARTS.length]} ${String.fromCharCode(65 + (i % 26))}${i >= 26 ? "2" : ""} ${COMPANY_FORMS[i % COMPANY_FORMS.length]}`,
  city: CITIES[(i * 3) % CITIES.length],
})).sort((a, b) => a.name.localeCompare(b.name, "de"));

/** Auswahllisten im Testmodus (Dienst und Testseite) */
export const TEST_OPTIONS: Record<string, string[]> = {
  supplier: ["Lieferant A", "Lieferant B"],
  manufacturer: ["Hersteller A", "Hersteller B", "Hersteller C"],
  serverType: ["Multi Site Cluster", "Single Server", "Single Site Cluster", "Windows Cluster"],
  maintenanceType: ["Servicevertrag", "Wartungsvertrag"],
  eol: ["Ja", "Nein"],
  raid: ["0", "1", "1+0", "5", "5+0"],
  monitor: ["Ja", "Nein"],
};

const VALUES: Record<string, string[]> = {
  serverType: ["Single Server", "Single Site Cluster", "Multi Site Cluster", "Windows Cluster"],
  lwlType: ["Kupfer", "Multimode SR", "Singlemode LR", "Duplex-Patchkabel 2 m"],
  maintenanceType: ["Wartungsvertrag", "Garantie"],
  notes: ["ESXi01", "ESXi02", "Backup", "Core Switch", "Access Switch", ""],
  supplier: ["Lieferant A", "Lieferant A", "Lieferant A", "Lieferant A", "Lieferant B"],
  manufacturer: ["Hersteller A", "Hersteller A", "Hersteller A", "Hersteller B"],
  status: ["Aktiv", "Aktiv", "Aktiv", "Abgeschlossen"],
  raid: ["5", "5", "5", "1+0"],
  diskType: ["SSD", "SAS HDD", "SSD SAS"],
  diskCount: ["4", "5", "8", "13"],
  // Adressen aus dem Dokumentationsbereich (RFC 5737), keine echten Netze
  subnet: ["255.255.255.0"],
  gateway: ["192.0.2.1", "198.51.100.1"],
  monitor: ["Ja", "Nein", "Nein"],
  dbType: ["Oracle SE2", "Oracle ESL", "Oracle EE"],
  dbVersion: ["19.27.0.0", "19.24.0.0", "23.5.0.0"],
  os: ["Linux", "Windows Server 2022", "Windows Server 2019"],
  charset: ["AL32UTF8", "WE8MSWIN1252"],
  sga: ["8GB", "16GB", "20GB"],
  pga: ["4GB", "8GB"],
  rmanCopyJob: ["Ja", "Nein"],
  rmanCopyJobPath: ["//backup-demo/rman"],
  rmanCopyJobUser: ["rman_demo"],
  dnsServer: ["192.0.2.53"],
  softwareContract: ["Ja", "Nein"],
  itServiceContract: ["Ja", "Nein"],
  function: ["APP-Server", "DB-Server", "WinCC-Server", "Terminalserver"],
  wincc: ["", "V8.1", "V7.5"],
  hardware: ["VM", "VM", "Physisch"],
  providedBy: ["Kunde", "Kunde", "Projekt-IT"],
  licenseType: ["vCenter Server 8 Standard", "vSphere 8 Essentials Plus", "System Edition", "Permanente Lizenz"],
  licenseCount: ["1", "3", "25", "Unlimited"],
  sensorCount: ["500", "1000"],
  oracleSupportStatus: ["Aktiv", "Aktiv", "Gekündigt"],
  hotlineStatus: ["Aktiv", "Gekündigt"],
};

/** Erfundene Einträge für einen Bereich; Firmen, Seriennummern und Bestellnummern sind ausgedacht */
export function testRows(area: Area): AreaRow[] {
  return Array.from({ length: area.testCount }, (_, i) => {
    const year = 2016 + (i % 9);
    const month = String((i % 12) + 1).padStart(2, "0");
    const row: AreaRow = { id: area.testIdBase + i };
    for (const field of area.fields) {
      const list = VALUES[field.key];
      let value: string;
      if (field.date) value = field.key === "supportUntil" ? `${year + 4}-${month}-15` : i % 3 === 0 ? `${year}-${month}-01` : "";
      else if (field.key === "company") value = TEST_CUSTOMERS[(i * 5) % TEST_CUSTOMERS.length].name;
      else if (field.key === "orderNumber") value = i % 7 === 6 ? "" : `TEST-${2000 + (i % 13)}-${String(100 + i * 7).padStart(3, "0")}`;
      else if (field.key === "manufacturer" && !field.options) value = `Gerät ${String.fromCharCode(65 + (i % 3))}${10 + (i % 4)}`;
      else if (field.key === "supplier" && !field.options) value = i % 2 ? "Händler A" : "Händler B";
      else if (field.key === "model") value = `${area.singular} ${String.fromCharCode(65 + (i % 4))}${100 + (i % 3) * 10}`;
      else if (field.key === "serviceTag" || field.key === "serialNumber") value = `TST${String(4711 + i * 13).padStart(6, "0")}`;
      else if (field.key === "license") value = `TEST-${String(10000 + i * 7919).slice(-5)}-LIZENZ`;
      else if (field.key === "licensee") value = TEST_CUSTOMERS[(i * 5) % TEST_CUSTOMERS.length].name;
      else if (field.key === "ipAddress") value = `192.0.2.${10 + i}`;
      else if (field.key === "hostname") value = `${area.id}-demo-${String(i + 1).padStart(2, "0")}`;
      else if (field.key === "eol") value = year + 4 < 2027 ? "Ja" : "Nein";
      else if (field.key === "type") value = area.singular;
      else if (list) value = list[i % list.length];
      else value = `Wert ${i + 1}`;
      row[field.key] = value;
    }
    return row;
  });
}
