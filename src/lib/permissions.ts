/** Rollen und Rechte je Bereich (gemeinsam für Dienst und Frontend) */
import { AREAS, groupPermission } from "./areas";
import { PMS_WRITE } from "./pms";
import { STAMMDATEN_LISTS, listPermission } from "./stammdaten";

export type Action = "read" | "create" | "edit" | "delete";

export interface AreaPermission {
  read: boolean;
  create: boolean;
  edit: boolean;
  delete: boolean;
}

/** Rechte je Bereich; Bereich "kunden" steht für Startseite, Kundenansicht und Kundenpflege */
export type Permissions = Record<string, AreaPermission>;

export const ACTIONS: { id: Action; label: string }[] = [
  { id: "read", label: "Lesen" },
  { id: "create", label: "Anlegen" },
  { id: "edit", label: "Bearbeiten" },
  { id: "delete", label: "Löschen" },
];

/** Bereiche in der Rechte-Tabelle; actions: nur diese Rechte sind dort sinnvoll (sonst alle vier) */
export const PERMISSION_AREAS: { id: string; label: string; actions?: Action[] }[] = [
  { id: "kunden", label: "Kunden" },
  ...Object.values(AREAS).flatMap((a) => [
    { id: a.id, label: a.plural ?? a.singular },
    // Feldgruppen (z. B. Oracle-ESL › Einkauf): nur Bearbeiten, Lesen hängt am Bereich
    ...(a.fieldGroups ?? []).map((g) => ({ id: groupPermission(a, g.id), label: `${a.plural ?? a.singular} › ${g.label}`, actions: ["edit"] as Action[] })),
  ]),
  // Lesen hängt an Oracle-ESL (siehe lib/pms.ts)
  { id: PMS_WRITE, label: "PMS-Module am Oracle-ESL-Vertrag", actions: ["create", "edit", "delete"] },
  // Lesen: Reiter Stammdaten sehen; Anlegen/Bearbeiten/Löschen hier gilt für alle Listen, darunter je Liste einzeln
  { id: "stammdaten", label: "Stammdaten (alle Listen)" },
  ...STAMMDATEN_LISTS.map((l) => ({ id: listPermission(l.id), label: `Stammdaten › ${l.label}`, actions: ["create", "edit", "delete"] as Action[] })),
  // Lesen: Seite sehen (welche Systeme, hängt am Leserecht der Bereiche); Bearbeiten: Status setzen
  { id: "auslaufend", label: "Auslaufende Kundensysteme", actions: ["read", "edit"] },
];

const NONE: AreaPermission = { read: false, create: false, edit: false, delete: false };
const FULL: AreaPermission = { read: true, create: true, edit: true, delete: true };

export function allPermissions(value: AreaPermission = FULL): Permissions {
  return Object.fromEntries(PERMISSION_AREAS.map((a) => [a.id, { ...value }]));
}

export const READ_ALL: Permissions = allPermissions({ ...NONE, read: true });

/** Rechte mehrerer Rollen zusammenführen: ein Recht gilt, wenn eine Rolle es gibt */
export function mergePermissions(list: Permissions[]): Permissions {
  const result = allPermissions(NONE);
  for (const p of list) for (const [area, perm] of Object.entries(p)) {
    if (!result[area]) continue;
    for (const a of ACTIONS) if (perm[a.id]) result[area][a.id] = true;
  }
  return result;
}

export function can(permissions: Permissions | undefined, area: string, action: Action): boolean {
  return Boolean(permissions?.[area]?.[action]);
}

export interface RoleMember {
  kind: "user" | "group";
  name: string;
}

export interface Role {
  id: number;
  name: string;
  description: string;
  isDefault: boolean;
  permissions: Permissions;
  members: RoleMember[];
  changedBy?: string;
  changedAt?: string;
}

export interface LoginLogEntry {
  id: number;
  at: string;
  username: string;
  displayName: string;
  success: boolean;
  reason: string;
  address: string;
}
