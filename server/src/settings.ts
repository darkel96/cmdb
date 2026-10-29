/**
 * Einstellungen, die Admins in der Verwaltung ändern können (LDAP, Datenbank, SMTP). Vorgabe sind die Werte aus der
 * .env; Änderungen liegen in einer Datei auf dem eigenen Volume (CMDB_DATA_DIR, Standard /app/data), nicht in der
 * Datenbank, weil die Datenbankverbindung selbst dazugehört. Passwörter stehen dort nur verschlüsselt (AES-256-GCM,
 * Schlüssel abgeleitet aus CMDB_SESSION_SECRET); sie verlassen den Dienst nie und stehen in keinem Protokoll.
 */
import { createCipheriv, createDecipheriv, hkdfSync, randomBytes } from "node:crypto";
import { chmodSync, existsSync, mkdirSync, readFileSync, renameSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { ENV } from "./env";
import { log } from "./log";

export interface LdapSettings {
  /** ldaps://… oder ldap://… (dann mit StartTLS) */
  url: string;
  domain: string;
  netbios: string;
  baseDn: string;
  adminGroup: string;
}

export interface DbSettings {
  server: string;
  port: number;
  database: string;
  user: string;
  password: string;
}

export type SmtpSecurity = "starttls" | "tls" | "none";

export interface SmtpSettings {
  host: string;
  port: number;
  security: SmtpSecurity;
  user: string;
  password: string;
  from: string;
  fromName: string;
}

export interface AllSettings {
  ldap: LdapSettings;
  db: DbSettings;
  smtp: SmtpSettings;
}

export type Section = keyof AllSettings;
export const SECTIONS: Section[] = ["ldap", "db", "smtp"];
/** Felder mit Passwort: nur verschlüsselt gespeichert, nie an den Browser */
const SECRET_FIELDS: Record<Section, string[]> = { ldap: [], db: ["password"], smtp: ["password"] };

/** Vorgaben aus der .env */
function defaults(): AllSettings {
  return {
    ldap: { url: ENV.ldapUrl, domain: ENV.ldapDomain, netbios: ENV.ldapNetbios, baseDn: ENV.ldapBaseDn, adminGroup: ENV.adminGroup },
    db: { server: ENV.dbServer, port: ENV.dbPort, database: ENV.dbName, user: ENV.dbUser, password: ENV.dbPassword },
    smtp: {
      host: ENV.smtpHost,
      port: ENV.smtpPort,
      security: ENV.smtpSecurity,
      user: ENV.smtpUser,
      password: ENV.smtpPassword,
      from: ENV.smtpFrom,
      fromName: ENV.smtpFromName,
    },
  };
}

type Overrides = { [S in Section]?: Partial<Record<keyof AllSettings[S], string | number>> } & { changedBy?: string; changedAt?: string };

const file = () => join(ENV.dataDir, "einstellungen.json");
let overrides: Overrides = {};
let loaded = false;

function key(): Buffer {
  return Buffer.from(hkdfSync("sha256", ENV.sessionSecret, "cmdb-einstellungen", "passwoerter", 32));
}

function encrypt(plain: string): string {
  const iv = randomBytes(12);
  const cipher = createCipheriv("aes-256-gcm", key(), iv);
  const data = Buffer.concat([cipher.update(plain, "utf8"), cipher.final()]);
  return `v1:${Buffer.concat([iv, cipher.getAuthTag(), data]).toString("base64")}`;
}

/** null, wenn der Wert nicht entschlüsselt werden kann (z. B. CMDB_SESSION_SECRET geändert) */
function decrypt(stored: string): string | null {
  try {
    if (!stored.startsWith("v1:")) return null;
    const raw = Buffer.from(stored.slice(3), "base64");
    const decipher = createDecipheriv("aes-256-gcm", key(), raw.subarray(0, 12));
    decipher.setAuthTag(raw.subarray(12, 28));
    return Buffer.concat([decipher.update(raw.subarray(28)), decipher.final()]).toString("utf8");
  } catch {
    return null;
  }
}

function load(): void {
  if (loaded) return;
  loaded = true;
  // Testmodus: nur im Speicher, nichts auf der Platte
  if (ENV.testMode || !existsSync(file())) return;
  try {
    overrides = JSON.parse(readFileSync(file(), "utf8")) as Overrides;
  } catch (e) {
    log(`Einstellungen: ${file()} nicht lesbar, es gelten die Werte aus der .env (${e instanceof Error ? e.message : String(e)})`);
  }
}

function persist(): void {
  if (ENV.testMode) return;
  mkdirSync(ENV.dataDir, { recursive: true });
  const tmp = `${file()}.neu`;
  writeFileSync(tmp, JSON.stringify(overrides, null, 2), { mode: 0o600 });
  chmodSync(tmp, 0o600);
  renameSync(tmp, file());
}

/** Wirksame Einstellungen eines Bereichs: .env, überschrieben von den Änderungen aus der Verwaltung */
export function settings<S extends Section>(section: S): AllSettings[S] {
  load();
  const result = { ...defaults()[section] } as Record<string, unknown>;
  for (const [field, value] of Object.entries(overrides[section] ?? {})) {
    if (SECRET_FIELDS[section].includes(field)) {
      const plain = typeof value === "string" ? decrypt(value) : null;
      if (plain !== null) result[field] = plain;
    } else result[field] = value;
  }
  return result as unknown as AllSettings[S];
}

/** Für die Verwaltung: Werte ohne Passwörter, dazu welche Felder geändert sind und ob ein Passwort gesetzt ist */
export interface SettingsView {
  values: Record<string, string | number>;
  changed: string[];
  passwordSet: boolean;
  /** Gespeichertes Passwort lässt sich nicht mehr entschlüsseln (Schlüssel geändert) */
  passwordUnreadable?: boolean;
}

export function settingsView(section: Section): SettingsView {
  load();
  const current = settings(section) as unknown as Record<string, string | number>;
  const values: Record<string, string | number> = {};
  for (const [field, value] of Object.entries(current)) if (!SECRET_FIELDS[section].includes(field)) values[field] = value;
  const stored = overrides[section] ?? {};
  const secret = SECRET_FIELDS[section][0];
  return {
    values,
    changed: Object.keys(stored),
    passwordSet: secret ? Boolean(current[secret]) : false,
    ...(secret && typeof (stored as Record<string, unknown>)[secret] === "string" && decrypt((stored as Record<string, string>)[secret]) === null
      ? { passwordUnreadable: true }
      : {}),
  };
}

/**
 * Neue Werte eines Bereichs (vollständig, wie im Formular). Felder gleich der .env werden nicht gespeichert, damit
 * eine spätere Änderung der .env wieder greift. Passwort: undefined = unverändert, "" = entfernen.
 */
export function candidate<S extends Section>(section: S, values: Partial<AllSettings[S]>, password?: string): AllSettings[S] {
  const next = { ...settings(section), ...values } as Record<string, unknown>;
  const secret = SECRET_FIELDS[section][0];
  if (secret && password !== undefined) next[secret] = password;
  return next as unknown as AllSettings[S];
}

export function saveSettings<S extends Section>(section: S, next: AllSettings[S], user: string): void {
  load();
  const base = defaults()[section] as unknown as Record<string, unknown>;
  const stored: Record<string, string | number> = {};
  for (const [field, value] of Object.entries(next as unknown as Record<string, string | number>)) {
    if (value === base[field]) continue;
    stored[field] = SECRET_FIELDS[section].includes(field) ? encrypt(String(value)) : value;
  }
  overrides = { ...overrides, [section]: stored, changedBy: user, changedAt: new Date().toISOString() };
  persist();
}

/** Wer zuletzt etwas geändert hat */
export function settingsMeta(): { changedBy?: string; changedAt?: string } {
  load();
  return { changedBy: overrides.changedBy, changedAt: overrides.changedAt };
}

/** Zurück auf die Werte aus der .env */
export function resetSettings(section: Section, user: string): void {
  load();
  const { [section]: _removed, ...rest } = overrides;
  overrides = { ...rest, changedBy: user, changedAt: new Date().toISOString() };
  persist();
}
