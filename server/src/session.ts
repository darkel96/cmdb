/**
 * Session als signiertes Cookie: base64url(JSON) + "." + HMAC-SHA256. Kein Speicher auf dem Server.
 * httpOnly, SameSite=Strict, Secure bei HTTPS, gültig für CMDB_SESSION_HOURS (Standard 8 Stunden).
 */
import { createHmac, timingSafeEqual } from "node:crypto";
import type { IncomingMessage, ServerResponse } from "node:http";
import type { SessionUser } from "@/lib/types";
import { ENV } from "./env";

export const COOKIE_NAME = "cmdb_session";

interface SessionPayload extends SessionUser {
  /** Ablauf als Unix-Zeit in Sekunden */
  exp: number;
}

function sign(data: string): string {
  return createHmac("sha256", ENV.sessionSecret).update(data).digest("base64url");
}

export function createSessionValue(user: SessionUser, now = Date.now(), seconds = ENV.sessionHours * 3600): string {
  const payload: SessionPayload = { ...user, exp: Math.floor(now / 1000) + seconds };
  const data = Buffer.from(JSON.stringify(payload)).toString("base64url");
  return `${data}.${sign(data)}`;
}

export function readSessionValue(value: string | undefined, now = Date.now()): SessionUser | null {
  if (!value) return null;
  const [data, mac] = value.split(".");
  if (!data || !mac) return null;
  const expected = Buffer.from(sign(data));
  const given = Buffer.from(mac);
  if (expected.length !== given.length || !timingSafeEqual(expected, given)) return null;
  try {
    const p = JSON.parse(Buffer.from(data, "base64url").toString("utf8")) as SessionPayload;
    if (typeof p.exp !== "number" || p.exp * 1000 <= now) return null;
    if (p.role !== "admin" && p.role !== "user") return null;
    const groups = Array.isArray(p.groups) ? p.groups.filter((g): g is string => typeof g === "string") : [];
    return { username: p.username, displayName: p.displayName, mail: p.mail, role: p.role, groups };
  } catch {
    return null;
  }
}

function parseCookies(header: string | undefined): Record<string, string> {
  const out: Record<string, string> = {};
  for (const part of (header ?? "").split(";")) {
    const i = part.indexOf("=");
    if (i > 0) out[part.slice(0, i).trim()] = part.slice(i + 1).trim();
  }
  return out;
}

export function sessionFromRequest(req: IncomingMessage): SessionUser | null {
  return readSessionValue(parseCookies(req.headers.cookie)[COOKIE_NAME]);
}

function cookie(value: string, maxAge: number, secure: boolean): string {
  return [`${COOKIE_NAME}=${value}`, "Path=/", "HttpOnly", "SameSite=Strict", `Max-Age=${maxAge}`, ...(secure ? ["Secure"] : [])].join("; ");
}

/** remember („Angemeldet bleiben“): CMDB_REMEMBER_DAYS statt CMDB_SESSION_HOURS, auch über einen Browser-Neustart */
export function setSessionCookie(res: ServerResponse, user: SessionUser, secure: boolean, remember = false): void {
  const seconds = remember ? ENV.rememberDays * 86400 : ENV.sessionHours * 3600;
  res.setHeader("Set-Cookie", cookie(createSessionValue(user, Date.now(), seconds), seconds, secure));
}

export function clearSessionCookie(res: ServerResponse, secure: boolean): void {
  res.setHeader("Set-Cookie", cookie("", 0, secure));
}
