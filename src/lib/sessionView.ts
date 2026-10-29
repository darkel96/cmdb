import { useEffect, useState } from "react";

/**
 * Ansicht einer Liste (Kunde, Filter, Sortierung, Seite …) für diese Browser-Sitzung merken, damit man nach dem Öffnen
 * eines Datensatzes und „Zurück“ wieder genau dort landet. Nur sessionStorage: gilt pro Tab, nichts wird gespeichert.
 */
const PREFIX = "cmdb-ansicht:";

export function readView<T>(key: string | undefined): Partial<T> {
  if (!key) return {};
  try {
    const parsed = JSON.parse(sessionStorage.getItem(PREFIX + key) ?? "{}") as unknown;
    return parsed && typeof parsed === "object" ? (parsed as Partial<T>) : {};
  } catch {
    return {};
  }
}

export function writeView(key: string | undefined, value: object): void {
  if (!key) return;
  try {
    sessionStorage.setItem(PREFIX + key, JSON.stringify(value));
  } catch {
    /* ohne Speicher gilt die Ansicht nur bis zum Verlassen der Seite */
  }
}

/** useState, dessen Wert unter `key` + `name` in der Sitzung gemerkt wird */
export function useSessionState<T>(key: string, name: string, initial: T): [T, (value: T) => void] {
  const [value, setValue] = useState<T>(() => {
    const saved = readView<Record<string, T>>(key)[name];
    return saved === undefined ? initial : saved;
  });
  useEffect(() => {
    writeView(key, { ...readView(key), [name]: value });
  }, [key, name, value]);
  return [value, setValue];
}
