/**
 * Alle Tabellen, in denen der Kundenname als Text steht (Verknüpfung in GAPTEQ nur über den Namen).
 * Beim Umbenennen eines Kunden ändert die CMDB den Namen in allen diesen Spalten in einer Transaktion,
 * beim Löschen prüft sie, dass hier nichts mehr auf den Kunden verweist.
 * Stand: Schema-Export 28.10.2026 (docs/schema/columns.csv). Ohne DS_Kunden selbst und ohne die View.
 */
export const CUSTOMER_LINKS: { table: string; column: string; label: string; maxLength: number }[] = [
  { table: "Server_manuell", column: "Firma", label: "Server", maxLength: 255 },
  { table: "Switche_manuell", column: "Firma", label: "Switche", maxLength: 255 },
  { table: "MDE_manuell", column: "Firma", label: "MDEs", maxLength: 255 },
  { table: "Storage_manuell", column: "Firma", label: "Storage", maxLength: 255 },
  { table: "Client_manuell", column: "Firma", label: "Clients", maxLength: 255 },
  { table: "Oracle_manuell", column: "Firma", label: "Oracle", maxLength: 255 },
  { table: "Windowssysteme_manuell", column: "Firma", label: "Windows-Systeme", maxLength: 255 },
  { table: "VMware_manuell", column: "Firma", label: "VMware", maxLength: 255 },
  { table: "TSPLUS_manuell", column: "Firma", label: "TSPLUS", maxLength: 255 },
  { table: "PRTG_manuell", column: "Firma", label: "PRTG", maxLength: 255 },
  { table: "VEEAM_manuell", column: "Firma", label: "Veeam", maxLength: 255 },
  { table: "Lizenzen_manuell", column: "Firma", label: "Lizenzen", maxLength: 255 },
  { table: "IT_Service_manuell", column: "Firma", label: "IT-Service", maxLength: 255 },
  { table: "Servicevertrag_manuell", column: "Firma", label: "Serviceverträge", maxLength: 255 },
  { table: "Vertragsdaten", column: "Kunde", label: "Oracle-ESL", maxLength: 255 },
  { table: "Vertraege", column: "Firma", label: "Verträge", maxLength: 255 },
  { table: "Anhang", column: "Firma", label: "Dokumente", maxLength: 255 },
  { table: "Anhang_Ticket", column: "Firma", label: "Ticket-Anhänge", maxLength: 100 },
  { table: "Firmenkontakte", column: "Firmenname", label: "Kontakte", maxLength: 200 },
  { table: "FW_IT", column: "Firma", label: "Firewall IT", maxLength: 255 },
  { table: "FW_SPS", column: "Firma", label: "Firewall SPS", maxLength: 255 },
  { table: "Linuxsysteme", column: "Firma", label: "Linux-Systeme", maxLength: 255 },
  { table: "Oracle_DB", column: "Firma", label: "Oracle-DB", maxLength: 255 },
  { table: "Server", column: "Firma", label: "Server (alt)", maxLength: 255 },
  { table: "Ergebnis_Server_manuell", column: "Firma", label: "Ergebnis Server", maxLength: 255 },
  { table: "Ergebnis_Switche_manuell", column: "Firma", label: "Ergebnis Switche", maxLength: 255 },
  { table: "NeueZielTabelle", column: "Firma", label: "NeueZielTabelle", maxLength: 255 },
  { table: "Zeiterfassung", column: "Kunde", label: "Zeiterfassung", maxLength: 255 },
];

/** Längster erlaubter Kundenname: die kürzeste Spalte, in die er beim Umbenennen geschrieben wird */
export const CUSTOMER_NAME_MAX = Math.min(...CUSTOMER_LINKS.map((l) => l.maxLength));
