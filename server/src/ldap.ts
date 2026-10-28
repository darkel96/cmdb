/**
 * Anmeldung gegen das Active Directory per LDAPS bzw. LDAP mit StartTLS. Kein Klartext-LDAP, kein Service-Account:
 * Der Dienst bindet sich mit den Anmeldedaten der Person selbst und liest danach nur deren eigenen Eintrag.
 */
import { Client, InvalidCredentialsError, escapeFilter } from "ldapts";
import type { CheckResult, Role, SessionUser } from "@/lib/types";
import { ENV, LDAP_CA } from "./env";

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
  const netbios = `${ENV.ldapNetbios.toLowerCase()}\\`;
  const upn = `@${ENV.ldapDomain.toLowerCase()}`;
  if (name.startsWith(netbios)) name = name.slice(netbios.length);
  if (name.endsWith(upn)) name = name.slice(0, -upn.length);
  return USERNAME.test(name) ? name : "";
}

function hostOf(url: string): string {
  return new URL(url).hostname;
}

function tlsOptions() {
  return { servername: hostOf(ENV.ldapUrl), minVersion: "TLSv1.2" as const, ...(LDAP_CA ? { ca: [LDAP_CA] } : {}) };
}

/** Verbindung mit Verschlüsselung: ldaps:// direkt, ldap:// nur mit StartTLS */
async function connect(): Promise<Client> {
  const client = new Client({ url: ENV.ldapUrl, timeout: ENV.ldapTimeoutMs, connectTimeout: ENV.ldapTimeoutMs, tlsOptions: tlsOptions() });
  if (ENV.ldapUrl.toLowerCase().startsWith("ldap://")) await client.startTLS(tlsOptions());
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
  if (ENV.adminGroup) {
    const group = ENV.adminGroup;
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
      await client.bind(`${username}@${ENV.ldapDomain}`, password);
    } catch (e) {
      if (e instanceof InvalidCredentialsError) throw new LoginError("Benutzername oder Passwort falsch.", 401);
      throw e;
    }
    const { searchEntries } = await client.search(ENV.ldapBaseDn, {
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

/** Verbindungstest ohne Anmeldedaten: TLS-Verbindung aufbauen und den RootDSE lesen (anonym erlaubt) */
export async function ldapCheck(): Promise<CheckResult> {
  const started = Date.now();
  let client: Client | undefined;
  try {
    client = await connect();
    const { searchEntries } = await client.search("", { scope: "base", filter: "(objectClass=*)", attributes: ["dnsHostName", "defaultNamingContext"] });
    const root = searchEntries[0] ?? {};
    return { ok: true, target: ENV.ldapUrl, latencyMs: Date.now() - started, detail: [first(root.dnsHostName), first(root.defaultNamingContext)].filter(Boolean).join(" · ") };
  } catch (e) {
    return { ok: false, target: ENV.ldapUrl, latencyMs: Date.now() - started, error: e instanceof Error ? e.message : String(e) };
  } finally {
    await client?.unbind().catch(() => undefined);
  }
}
