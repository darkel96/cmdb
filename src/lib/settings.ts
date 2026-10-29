import type { CheckResult } from "./types";

/** Bereiche der Einstellungen in der Verwaltung (Karten unter Status) */
export type SettingsSectionId = "ldap" | "db" | "smtp";

export interface SettingsField {
  key: string;
  label: string;
  type?: "text" | "number" | "select";
  options?: { value: string; label: string }[];
  required?: boolean;
  placeholder?: string;
  help?: string;
}

export interface SettingsSection {
  id: SettingsSectionId;
  title: string;
  /** Passwortfeld (nur setzen, nie anzeigen) */
  password?: boolean;
  /** Speichern nur nach erfolgreichem Verbindungstest (sonst wäre Anmeldung bzw. Datenzugriff weg) */
  testRequired: boolean;
  fields: SettingsField[];
}

export const SETTINGS_SECTIONS: SettingsSection[] = [
  {
    id: "ldap",
    title: "LDAP (Active Directory)",
    testRequired: true,
    fields: [
      { key: "url", label: "Server-Adresse", required: true, placeholder: "ldaps://dc.example.loc:636", help: "ldaps:// oder ldap:// (dann mit StartTLS)" },
      { key: "domain", label: "Domäne (UPN)", required: true, placeholder: "example.loc" },
      { key: "netbios", label: "NetBIOS-Name", required: true, placeholder: "EXAMPLE" },
      { key: "baseDn", label: "Basis-OU", required: true, help: "Nur Konten unterhalb dieser OU dürfen sich anmelden" },
      { key: "adminGroup", label: "Admin-Gruppe", help: "Optional: Mitglieder dieser AD-Gruppe (CN) sind Admin" },
    ],
  },
  {
    id: "db",
    title: "Datenbank (SQL Server)",
    password: true,
    testRequired: true,
    fields: [
      { key: "server", label: "Server", required: true },
      { key: "port", label: "Port", type: "number", required: true },
      { key: "database", label: "Datenbank", required: true },
      { key: "user", label: "Benutzer", required: true },
    ],
  },
  {
    id: "smtp",
    title: "E-Mail (SMTP)",
    password: true,
    testRequired: false,
    fields: [
      { key: "host", label: "Server", placeholder: "mail.example.loc", help: "Leer = kein Mailversand" },
      { key: "port", label: "Port", type: "number", required: true },
      {
        key: "security",
        label: "Verschlüsselung",
        type: "select",
        required: true,
        options: [
          { value: "starttls", label: "STARTTLS (meist Port 587)" },
          { value: "tls", label: "TLS (meist Port 465)" },
          { value: "none", label: "Keine (nur internes Relay ohne Anmeldung)" },
        ],
      },
      { key: "user", label: "Benutzer", help: "Leer = ohne Anmeldung" },
      { key: "from", label: "Absenderadresse", placeholder: "cmdb@example.loc" },
      { key: "fromName", label: "Absendername" },
    ],
  },
];

export interface SettingsSectionView {
  values: Record<string, string | number>;
  /** Felder, die von der .env abweichen (in der Verwaltung geändert) */
  changed: string[];
  passwordSet: boolean;
  passwordUnreadable?: boolean;
}

export interface SettingsResponse {
  sections: Record<SettingsSectionId, SettingsSectionView>;
  changedBy?: string;
  changedAt?: string;
}

/** Neue Werte eines Bereichs; password: undefined = unverändert, "" = entfernen */
export interface SettingsInput {
  values: Record<string, string | number>;
  password?: string;
}

export type SettingsCheck = CheckResult;
