/**
 * Lokales Admin-Konto ohne AD (z. B. zum Testen von Rechten mit dem eigenen AD-Konto oder als Notzugang).
 * In der .env steht nur ein scrypt-Hash (CMDB_LOCAL_ADMIN_HASH), nie das Passwort; gesetzt mit
 * server/tools/lokaler-admin.mjs. Ohne Hash gibt es kein lokales Konto.
 */
import { scryptSync, timingSafeEqual } from "node:crypto";
import type { SessionUser } from "@/lib/types";
import { ENV } from "./env";

/** Format: scrypt:N:r:p:salz(base64):hash(base64) */
function verify(password: string, stored: string): boolean {
  const [kind, n, r, p, salt, hash] = stored.split(":");
  if (kind !== "scrypt" || !salt || !hash) return false;
  const N = Number(n), R = Number(r), P = Number(p);
  const expected = Buffer.from(hash, "base64");
  const actual = scryptSync(password, Buffer.from(salt, "base64"), expected.length, { N, r: R, p: P, maxmem: 256 * N * R });
  return actual.length === expected.length && timingSafeEqual(actual, expected);
}

/** Ist dieser Name das lokale Konto? Dann wird nicht gegen das AD geprüft. */
export function isLocalAdmin(username: string): boolean {
  return Boolean(ENV.localAdminUser && ENV.localAdminHash && username === ENV.localAdminUser);
}

/** Lokales Konto prüfen; null bei falschem Passwort */
export function localAdminLogin(username: string, password: string): SessionUser | null {
  if (!isLocalAdmin(username) || !verify(password, ENV.localAdminHash)) return null;
  return { username, displayName: "Lokaler Admin", mail: "", role: "admin", groups: [] };
}
