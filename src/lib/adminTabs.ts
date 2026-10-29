import { AREAS } from "./areas";
import type { Action } from "./permissions";

/** Reiter der Verwaltung in dieser Reihenfolge; jeder nur mit dem passenden Recht sichtbar */
export const ADMIN_TABS = [
  { id: "anlage-vertrag", label: "Anlage Vertrag" },
  { id: "stammdaten", label: "Stammdaten" },
  { id: "status", label: "Status" },
  { id: "anmeldungen", label: "Anmeldungen" },
  { id: "rollen", label: "Rollen" },
] as const;

export type AdminTabId = (typeof ADMIN_TABS)[number]["id"];

export function visibleAdminTabs(isAdmin: boolean, can: (area: string, action: Action) => boolean) {
  return ADMIN_TABS.filter((t) => {
    // „Anlage Vertrag“ für alle, die in mindestens einem Bereich anlegen dürfen
    if (t.id === "anlage-vertrag") return Object.values(AREAS).some((a) => a.createFields && can(a.id, "create"));
    if (t.id === "stammdaten") return can("stammdaten", "read");
    return isAdmin;
  });
}
