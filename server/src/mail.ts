/**
 * E-Mail-Versand über SMTP mit den Einstellungen aus der Verwaltung. Zertifikate werden immer geprüft
 * (Zertifikatsspeicher von Node, dazu optional die interne CA aus CMDB_SMTP_CA). Ohne Verschlüsselung („none“) nur
 * für interne Relays ohne Anmeldung: Benutzer und Passwort werden nie unverschlüsselt übertragen.
 */
import { rootCertificates } from "node:tls";
import nodemailer from "nodemailer";
import type { CheckResult } from "@/lib/types";
import { SMTP_CA } from "./env";
import { settings, type SmtpSettings } from "./settings";

export class MailError extends Error {}

function transport(smtp: SmtpSettings) {
  if (!smtp.host) throw new MailError("Kein SMTP-Server eingetragen.");
  if (smtp.security === "none" && smtp.user) throw new MailError("Ohne Verschlüsselung keine Anmeldung: Benutzer leer lassen oder STARTTLS/TLS wählen.");
  return nodemailer.createTransport({
    host: smtp.host,
    port: smtp.port,
    secure: smtp.security === "tls",
    requireTLS: smtp.security === "starttls",
    ignoreTLS: smtp.security === "none",
    ...(smtp.user ? { auth: { user: smtp.user, pass: smtp.password } } : {}),
    tls: { servername: smtp.host, minVersion: "TLSv1.2", ...(SMTP_CA ? { ca: [...rootCertificates, SMTP_CA] } : {}) },
    connectionTimeout: 10_000,
    greetingTimeout: 10_000,
    socketTimeout: 20_000,
  });
}

const target = (smtp: SmtpSettings) => (smtp.host ? `${smtp.host}:${smtp.port} (${{ starttls: "STARTTLS", tls: "TLS", none: "ohne Verschlüsselung" }[smtp.security]})` : "(nicht eingerichtet)");

/** Verbindung und Anmeldung prüfen, ohne eine Mail zu senden */
export async function smtpCheck(smtp: SmtpSettings = settings("smtp")): Promise<CheckResult> {
  if (!smtp.host) return { ok: false, target: target(smtp), error: "Kein SMTP-Server eingetragen." };
  const started = Date.now();
  try {
    await transport(smtp).verify();
    return { ok: true, target: target(smtp), latencyMs: Date.now() - started, detail: [smtp.user ? `Anmeldung als ${smtp.user}` : "ohne Anmeldung", smtp.from && `Absender ${smtp.from}`].filter(Boolean).join(" · ") };
  } catch (e) {
    return { ok: false, target: target(smtp), latencyMs: Date.now() - started, error: e instanceof Error ? e.message : String(e) };
  }
}

export async function sendMail(to: string, subject: string, text: string, smtp: SmtpSettings = settings("smtp")): Promise<void> {
  if (!smtp.from) throw new MailError("Keine Absenderadresse eingetragen.");
  await transport(smtp).sendMail({ from: smtp.fromName ? { name: smtp.fromName, address: smtp.from } : smtp.from, to, subject, text });
}
