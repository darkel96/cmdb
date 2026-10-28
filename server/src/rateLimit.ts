/**
 * Einfache Begrenzung fehlgeschlagener Anmeldungen, im Speicher des Dienstes.
 * Gezählt wird je Benutzername („user:…“) und je Client-Adresse („ip:…“). Nach CMDB_LOGIN_MAX_FAILURES Fehlversuchen
 * für einen Benutzernamen (bzw. dem Vierfachen für eine Adresse, weil sich mehrere Personen eine teilen können)
 * innerhalb von CMDB_LOGIN_LOCK_MINUTES ist die Anmeldung bis zum Ablauf des Fensters gesperrt.
 * Das schützt auch die AD-Konten vor einer Sperre durch zu viele Fehlversuche.
 */
import { ENV } from "./env";

interface Entry {
  failures: number;
  /** Ende des Fensters (ms) */
  until: number;
}

const entries = new Map<string, Entry>();

function windowMs(): number {
  return ENV.loginLockMinutes * 60_000;
}

function limitFor(key: string): number {
  return key.startsWith("ip:") ? ENV.loginMaxFailures * 4 : ENV.loginMaxFailures;
}

function current(key: string, now: number): Entry | undefined {
  const e = entries.get(key);
  if (e && e.until <= now) {
    entries.delete(key);
    return undefined;
  }
  return e;
}

/** Sekunden bis zur Freigabe, wenn einer der Schlüssel gesperrt ist, sonst 0 */
export function lockedFor(keys: string[], now = Date.now()): number {
  let wait = 0;
  for (const key of keys) {
    const e = current(key, now);
    if (e && e.failures >= limitFor(key)) wait = Math.max(wait, Math.ceil((e.until - now) / 1000));
  }
  return wait;
}

export function recordFailure(keys: string[], now = Date.now()): void {
  for (const key of keys) {
    const e = current(key, now) ?? { failures: 0, until: now + windowMs() };
    e.failures += 1;
    entries.set(key, e);
  }
}

export function recordSuccess(keys: string[]): void {
  for (const key of keys) entries.delete(key);
}

// Abgelaufene Einträge regelmässig entfernen, damit die Map nicht wächst
setInterval(() => {
  const now = Date.now();
  for (const [key, e] of entries) if (e.until <= now) entries.delete(key);
}, 60_000).unref();
