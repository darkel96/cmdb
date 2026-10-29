/**
 * Anmeldung gegen das Active Directory per LDAPS bzw. LDAP mit StartTLS. Kein Klartext-LDAP, kein Service-Account:
 * Der Dienst bindet sich mit den Anmeldedaten der Person selbst und liest danach nur deren eigenen Eintrag.
 */
import { Client, InvalidCredentialsError, escapeFilter } from "ldapts";
import type { CheckResult, Role, SessionUser } from "@/lib/types";
import { ENV, LDAP_CA } from "./env";
import { settings, type LdapSettings } from "./settings";

export class LoginError extends Error {
  constructor(message: string, readonly status: number) {
    super(message);
  }
}

/** Erlaubte Zeichen im Anmeldenamen (sAMAccountName) */
const USERNAME = /^[a-z0-9][a-z0-9._-]{0,63}$/;

/** „dario.keller“, „ABERLE-IT\dario.keller“ oder „dario.keller@aberle-it.loc“ → „dario.keller“; ungültig → "" */
export function normalizeUsername(input: string): string {
  let name = input.trim().toLowerCase();
  const ldap = settings("ldap");
  const netbios = `${ldap.netbios.toLowerCase()}\\`;
  const upn = `@${ldap.domain.toLowerCase()}`;
  if (name.startsWith(netbios)) name = name.slice(netbios.length);
  if (name.endsWith(upn)) name = name.slice(0, -upn.length);
  return USERNAME.test(name) ? name : "";
}

function hostOf(url: string): string {
  return new URL(url).hostname;
}

function tlsOptions(url: string) {
  return { servername: hostOf(url), minVersion: "TLSv1.2" as const, ...(LDAP_CA ? { ca: [LDAP_CA] } : {}) };
}

/** Verbindung mit Verschlüsselung: ldaps:// direkt, ldap:// nur mit StartTLS; anderes wird abgelehnt */
async function connect(url = settings("ldap").url): Promise<Client> {
  const lower = url.toLowerCase();
  if (!lower.startsWith("ldaps://") && !lower.startsWith("ldap://")) throw new Error("Die LDAP-Adresse muss mit ldaps:// oder ldap:// beginnen.");
  const client = new Client({ url, timeout: ENV.ldapTimeoutMs, connectTimeout: ENV.ldapTimeoutMs, tlsOptions: tlsOptions(url) });
  if (lower.startsWith("ldap://")) await client.startTLS(tlsOptions(url));
  return client;
}

function first(value: unknown): string {
  if (Array.isArray(value)) return first(value[0]);
  if (Buffer.isBuffer(value)) return value.toString("utf8");
  return typeof value === "string" ? value : "";
}

function all(value: unknown): string[] {
  return (Array.isArray(value) ? value : value ? [value] : []).map(first).filter(Boolean);
}

export function roleFor(username: string, memberOf: string[]): Role {
  if (ENV.admins.includes(username)) return "admin";
  const adminGroup = settings("ldap").adminGroup.toLowerCase();
  if (adminGroup) {
    const group = adminGroup;
    const isMember = memberOf.some((dn) => {
      const lower = dn.toLowerCase();
      return lower === group || lower.startsWith(`cn=${group},`);
    });
    if (isMember) return "admin";
  }
  return "user";
}

/** Prüft Benutzer und Passwort am AD und liefert die Person; das Passwort verlässt diese Funktion nicht */
export async function ldapLogin(username: string, password: string): Promise<SessionUser> {
  // Ein leeres Passwort wäre am AD ein anonymer Bind und gälte als „erfolgreich“
  if (!username || !password) throw new LoginError("Benutzername oder Passwort falsch.", 401);
  const client = await connect();
  try {
    try {
      await client.bind(`${username}@${settings("ldap").domain}`, password);
    } catch (e) {
      if (e instanceof InvalidCredentialsError) throw new LoginError("Benutzername oder Passwort falsch.", 401);
      throw e;
    }
    const { searchEntries } = await client.search(settings("ldap").baseDn, {
      scope: "sub",
      filter: escapeFilter`(&(objectCategory=person)(objectClass=user)(sAMAccountName=${username}))`,
      attributes: ["sAMAccountName", "displayName", "mail", "memberOf"],
      sizeLimit: 2,
    });
    if (searchEntries.length !== 1) throw new LoginError("Für dieses Konto ist die CMDB nicht freigegeben.", 403);
    const entry = searchEntries[0];
    const name = first(entry.sAMAccountName).toLowerCase() || username;
    return {
      username: name,
      displayName: first(entry.displayName) || name,
      mail: first(entry.mail),
      role: roleFor(name, all(entry.memberOf)),
      // Für Rollen über AD-Gruppen: nur der CN, klein geschrieben, höchstens 100 (Größe des Session-Cookies)
      groups: all(entry.memberOf).map((dn) => /^cn=([^,]+)/i.exec(dn)?.[1]?.toLowerCase() ?? "").filter(Boolean).slice(0, 100),
    };
  } finally {
    await client.unbind().catch(() => undefined);
  }
}

/**
 * Verbindungstest ohne Anmeldedaten: TLS-Verbindung aufbauen und den RootDSE lesen (anonym erlaubt). Mit ldap:
 * neue Werte aus der Verwaltung vor dem Speichern prüfen, auch ob die Basis-OU existiert.
 */
export async function ldapCheck(candidate?: LdapSettings): Promise<CheckResult> {
  const started = Date.now();
  const target = (candidate ?? settings("ldap")).url;
  let client: Client | undefined;
  try {
    client = await connect(target);
    const { searchEntries } = await client.search("", { scope: "base", filter: "(objectClass=*)", attributes: ["dnsHostName", "defaultNamingContext"] });
    const root = searchEntries[0] ?? {};
    // Basis-OU muss unterhalb des Verzeichnisses liegen, sonst könnte sich niemand mehr anmelden
    const naming = first(root.defaultNamingContext).toLowerCase();
    if (candidate && naming && !candidate.baseDn.toLowerCase().replace(/\s+/g, "").endsWith(naming.replace(/\s+/g, "")))
      return { ok: false, target, latencyMs: Date.now() - started, error: `Die Basis-OU liegt nicht unter ${first(root.defaultNamingContext)}.` };
    return { ok: true, target, latencyMs: Date.now() - started, detail: [first(root.dnsHostName), first(root.defaultNamingContext)].filter(Boolean).join(" · ") };
  } catch (e) {
    return { ok: false, target, latencyMs: Date.now() - started, error: e instanceof Error ? e.message : String(e) };
  } finally {
    await client?.unbind().catch(() => undefined);
  }
}
