/**
 * Erfundene Daten für den Testmodus (Dienst mit CMDB_TESTMODE=1 und GitHub Pages).
 * Keine echten Hostnamen, IP-Adressen, Firmen oder Personen.
 */
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
export const TEST_CUSTOMERS: Customer[] = Array.from({ length: 42 }, (_, i) => ({
  id: i + 1,
  name: `${COMPANY_PARTS[i % COMPANY_PARTS.length]} ${String.fromCharCode(65 + (i % 26))}${i >= 26 ? "2" : ""} ${COMPANY_FORMS[i % COMPANY_FORMS.length]}`,
  city: CITIES[(i * 3) % CITIES.length],
})).sort((a, b) => a.name.localeCompare(b.name, "de"));
