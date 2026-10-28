/**
 * Erfundene Daten für den Testmodus (Dienst mit CMDB_TESTMODE=1 und GitHub Pages).
 * Keine echten Hostnamen, IP-Adressen, Firmen oder Personen.
 */
import type { ConfigurationItem, Customer, Server, SessionUser } from "./types";

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
export const TEST_CUSTOMERS: Customer[] = Array.from({ length: 42 }, (_, i) => ({
  id: i + 1,
  name: `${COMPANY_PARTS[i % COMPANY_PARTS.length]} ${String.fromCharCode(65 + (i % 26))}${i >= 26 ? "2" : ""} ${COMPANY_FORMS[i % COMPANY_FORMS.length]}`,
  city: CITIES[(i * 3) % CITIES.length],
})).sort((a, b) => a.name.localeCompare(b.name, "de"));

const SERVER_TYPES = ["Single Server", "Single Side Cluster", "Multi Side Cluster", "Windows Cluster"];
const SERVER_NOTES = ["ESXi01", "ESXi02", "Backup Server", "Witness", ""];

/** 24 erfundene Server; Firmen, Seriennummern und Bestellnummern sind ausgedacht */
export const TEST_SERVERS: Server[] = Array.from({ length: 24 }, (_, i) => {
  const customer = TEST_CUSTOMERS[(i * 5) % TEST_CUSTOMERS.length];
  const year = 2016 + (i % 9);
  const month = String((i % 12) + 1).padStart(2, "0");
  return {
    id: 10000 + i,
    type: "Server",
    company: customer.name,
    orderNumber: i % 7 === 6 ? "" : `TEST-${2000 + (i % 13)}-${String(100 + i * 7).padStart(3, "0")}`,
    supplier: i % 5 === 4 ? "Lieferant B" : "Lieferant A",
    manufacturer: i % 4 === 3 ? "Hersteller B" : "Hersteller A",
    model: i % 4 === 3 ? `Tower T${300 + (i % 3) * 10}` : `Rack ${1 + (i % 2)}U Gen${8 + (i % 3)}`,
    serverType: SERVER_TYPES[i % SERVER_TYPES.length],
    serviceTag: `TST${String(4711 + i * 13).padStart(6, "0")}`,
    maintenanceType: "Wartungsvertrag",
    supportUntil: `${year + 4}-${month}-15`,
    notes: SERVER_NOTES[i % SERVER_NOTES.length],
    deliveredOn: i % 3 === 0 ? `${year}-${month}-01` : null,
    eol: year + 4 < 2027 ? "Ja" : "Nein",
    status: "Aktiv",
  };
});
