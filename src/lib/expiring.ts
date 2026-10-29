/**
 * Regel „auslaufend“: Ein System gilt als auslaufend vom 9. Monat vor bis zum 9. Monat nach seinem Support-Ende.
 * Gilt für „Auslaufende Kundensysteme“ und das Kundendatenblatt (eine Stelle, damit beide dasselbe zeigen).
 */
export const EXPIRING_MONTHS = 9;

const pad = (n: number) => String(n).padStart(2, "0");
const iso = (d: Date) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;

/** Monate addieren; am Monatsende auf den letzten Tag begrenzen (31.05. − 3 Monate = 28./29.02.) */
function addMonths(date: Date, months: number): Date {
  const d = new Date(date.getFullYear(), date.getMonth() + months, 1);
  const last = new Date(d.getFullYear(), d.getMonth() + 1, 0).getDate();
  d.setDate(Math.min(date.getDate(), last));
  return d;
}

/** Zeitfenster als JJJJ-MM-TT, beide Grenzen eingeschlossen */
export function expiringWindow(now = new Date()): { from: string; to: string; today: string } {
  return { from: iso(addMonths(now, -EXPIRING_MONTHS)), to: iso(addMonths(now, EXPIRING_MONTHS)), today: iso(now) };
}

/** Liegt das Support-Ende im Fenster? Ohne Datum: nein */
export function inExpiringWindow(date: string, window = expiringWindow()): boolean {
  return Boolean(date) && date >= window.from && date <= window.to;
}

export const deDate = (value: string) => (/^\d{4}-\d{2}-\d{2}$/.test(value) ? `${value.slice(8, 10)}.${value.slice(5, 7)}.${value.slice(0, 4)}` : value);
