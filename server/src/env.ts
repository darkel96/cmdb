/** Einstellungen des CMDB-Dienstes, komplett aus der Umgebung (siehe server/.env.example) */
import { randomBytes } from "node:crypto";
import { readFileSync } from "node:fs";

const env = process.env;
const yes = (v: string | undefined) => /^(1|true|ja|yes)$/i.test(v ?? "");
const str = (v: string | undefined, fallback = "") => String(v ?? "").trim() || fallback;
const list = (v: string | undefined) => str(v).split(",").map((s) => s.trim().toLowerCase()).filter(Boolean);

const fileErrors: string[] = [];

function readOptionalFile(name: string, path: string): string | undefined {
  if (!path) return undefined;
  try {
    return readFileSync(path, "utf8");
  } catch (e) {
    fileErrors.push(`${name}: ${path} nicht lesbar (${e instanceof Error ? e.message : String(e)}).`);
    return undefined;
  }
}

const testMode = yes(env.CMDB_TESTMODE);

export const ENV = {
  version: str(env.CMDB_VERSION, "entwicklung"),
  port: Number(env.CMDB_PORT) || 8790,
  /** Testmodus: feste Testbenutzer, kein LDAP, keine Datenbank, erfundene Daten. Im Betrieb nie setzen. */
  testMode,
  /** Verzeichnis mit dem gebauten Frontend (dist); leer = nur API */
  staticDir: str(env.CMDB_STATIC),

  /** HMAC-Schlüssel für das Session-Cookie (mindestens 32 Zeichen). Im Testmodus ohne Angabe zufällig je Start. */
  sessionSecret: str(env.CMDB_SESSION_SECRET) || (testMode ? randomBytes(32).toString("hex") : ""),
  sessionHours: Number(env.CMDB_SESSION_HOURS) || 8,
  /** „Angemeldet bleiben“ auf der Anmeldeseite: so viele Tage (Rolle und AD-Gruppen gelten so lange wie bei der Anmeldung) */
  rememberDays: Math.min(Number(env.CMDB_REMEMBER_DAYS) || 7, 30),
  /** HTTPS direkt im Dienst (PEM-Dateien); sonst nur HTTP, z. B. hinter einem Reverse-Proxy */
  tlsCert: str(env.CMDB_TLS_CERT),
  tlsKey: str(env.CMDB_TLS_KEY),
  /** Hinter einem Reverse-Proxy mit HTTPS: X-Forwarded-Proto und X-Forwarded-For auswerten */
  trustProxy: yes(env.CMDB_TRUST_PROXY),
  /** Anmeldung über unverschlüsseltes HTTP erlauben (nur für lokale Entwicklung, nie im Betrieb) */
  allowInsecureHttp: yes(env.CMDB_ALLOW_INSECURE_HTTP),

  /** ldaps://host:636 oder ldap://host:389 (dann zwingend StartTLS) */
  ldapUrl: str(env.CMDB_LDAP_URL, "ldaps://rom.aberle-it.loc:636"),
  /** UPN-Suffix für den Bind: <user>@<domain> */
  ldapDomain: str(env.CMDB_LDAP_DOMAIN, "aberle-it.loc"),
  /** NetBIOS-Name, damit auch „ABERLE-IT\user“ als Eingabe funktioniert */
  ldapNetbios: str(env.CMDB_LDAP_NETBIOS, "ABERLE-IT"),
  /** Nur Konten unterhalb dieser OU dürfen sich anmelden */
  ldapBaseDn: str(env.CMDB_LDAP_BASE_DN, "OU=Aberle Automation,OU=Aberle Mitarbeiter,DC=Aberle-IT,DC=loc"),
  /** CA-Zertifikat (PEM) für LDAPS/StartTLS; leer = Zertifikatsspeicher von Node */
  ldapCaFile: str(env.CMDB_LDAP_CA),
  ldapTimeoutMs: Number(env.CMDB_LDAP_TIMEOUT_MS) || 8000,

  /** Anmeldenamen mit Rolle admin, durch Komma getrennt */
  admins: list(env.CMDB_ADMINS ?? "dario.keller"),
  /** Optional: AD-Gruppe (CN oder vollständiger DN), deren Mitglieder admin sind */
  adminGroup: str(env.CMDB_ADMIN_GROUP).toLowerCase(),

  dbServer: str(env.CMDB_DB_SERVER),
  dbPort: Number(env.CMDB_DB_PORT) || 1433,
  dbName: str(env.CMDB_DB_NAME, "CMDB"),
  dbUser: str(env.CMDB_DB_USER),
  dbPassword: String(env.CMDB_DB_PASSWORD ?? ""),
  /** CA-Zertifikat (PEM) des SQL Servers; alternativ CMDB_DB_TRUST_CERT=1 (nur, wenn kein Zertifikat einer CA vorhanden ist) */
  dbCaFile: str(env.CMDB_DB_CA),
  dbTrustServerCert: yes(env.CMDB_DB_TRUST_CERT),

  /** Fehlversuche je Benutzer bzw. Adresse, bevor die Anmeldung gesperrt wird */
  loginMaxFailures: Number(env.CMDB_LOGIN_MAX_FAILURES) || 5,
  loginLockMinutes: Number(env.CMDB_LOGIN_LOCK_MINUTES) || 15,

  /** Firmenlogo, Anmeldebild, Favicon (lokal, nicht im Repository); leer = neutrale Darstellung */
  brandingDir: str(env.CMDB_BRANDING_DIR),

  /** Verzeichnis für Daten des Dienstes (Einstellungen aus der Verwaltung); im Container ein eigenes Volume */
  dataDir: str(env.CMDB_DATA_DIR, "/app/data"),

  /** E-Mail-Versand (Vorgaben; in der Verwaltung änderbar). Leer = nicht eingerichtet. */
  smtpHost: str(env.CMDB_SMTP_HOST),
  smtpPort: Number(env.CMDB_SMTP_PORT) || 587,
  /** starttls (Port 587), tls (Port 465) oder none (nur interne Relays ohne Anmeldung) */
  smtpSecurity: (["starttls", "tls", "none"].includes(str(env.CMDB_SMTP_SECURITY)) ? str(env.CMDB_SMTP_SECURITY) : "starttls") as "starttls" | "tls" | "none",
  smtpUser: str(env.CMDB_SMTP_USER),
  smtpPassword: String(env.CMDB_SMTP_PASSWORD ?? ""),
  smtpFrom: str(env.CMDB_SMTP_FROM),
  smtpFromName: str(env.CMDB_SMTP_FROM_NAME, "CMDB"),
  /** CA-Zertifikat (PEM) des Mailservers, falls von der internen CA; leer = Zertifikatsspeicher von Node */
  smtpCaFile: str(env.CMDB_SMTP_CA),
};

// Im Testmodus werden LDAP und Datenbank nicht angesprochen, die CA-Dateien also auch nicht gebraucht
export const LDAP_CA = testMode ? undefined : readOptionalFile("CMDB_LDAP_CA", ENV.ldapCaFile);
export const DB_CA = testMode ? undefined : readOptionalFile("CMDB_DB_CA", ENV.dbCaFile);
export const SMTP_CA = testMode ? undefined : readOptionalFile("CMDB_SMTP_CA", ENV.smtpCaFile);

/** Fehlende oder widersprüchliche Einstellungen; der Dienst startet dann nicht */
export function checkEnv(): string[] {
  const errors: string[] = [...fileErrors];
  if (ENV.sessionSecret.length < 32) errors.push("CMDB_SESSION_SECRET fehlt oder ist kürzer als 32 Zeichen.");
  if (Boolean(ENV.tlsCert) !== Boolean(ENV.tlsKey)) errors.push("CMDB_TLS_CERT und CMDB_TLS_KEY nur zusammen angeben.");
  if (!ENV.testMode) {
    if (!/^ldaps?:\/\//i.test(ENV.ldapUrl)) errors.push("CMDB_LDAP_URL muss mit ldaps:// oder ldap:// beginnen.");
    if (!ENV.admins.length && !ENV.adminGroup) errors.push("CMDB_ADMINS oder CMDB_ADMIN_GROUP angeben.");
  }
  return errors;
}
