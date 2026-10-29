/** Änderungsverlauf je Eintrag (gemeinsam für Dienst und Frontend) */

export type HistoryAction = "angelegt" | "geändert" | "gelöscht" | "status" | "dokument";

export interface HistoryChange {
  label: string;
  old?: string;
  new?: string;
  /** Passwort o. Ä.: nur „geändert“, nie der Wert */
  secret?: boolean;
}

export interface HistoryEntry {
  id: number;
  at: string;
  username: string;
  action: HistoryAction;
  changes: HistoryChange[];
}

export interface HistoryResponse {
  items: HistoryEntry[];
  /** false, wenn der Verlauf (noch) nicht verfügbar ist, z. B. Schema cmdb fehlt */
  available: boolean;
}
