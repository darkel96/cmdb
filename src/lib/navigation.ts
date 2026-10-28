/**
 * Navigation in der Seitenleiste, angelehnt an die bisherige GAPTEQ-Anwendung.
 * Die Unterpunkte folgen den Tabellen der Datenbank (siehe docs/schema-analyse.md); ihre Seiten kommen ab Phase 1.
 */
import { Code, HardDrive, KeyRound, List, Monitor, Plug, type LucideIcon } from "lucide-react";

export interface NavLeaf {
  /** Teil der Adresse: /bereich/<id> */
  id: string;
  label: string;
}

export interface NavGroup {
  id: string;
  label: string;
  icon: LucideIcon;
  items: NavLeaf[];
}

export const NAV_GROUPS: NavGroup[] = [
  {
    id: "hardware",
    label: "Hardware",
    icon: HardDrive,
    // Reihenfolge wie in GAPTEQ
    items: [
      { id: "server", label: "Server" },
      { id: "switche", label: "Switche" },
      { id: "mde", label: "MDE" },
      { id: "storage", label: "Storage" },
      { id: "client", label: "Client" },
    ],
  },
  {
    id: "software",
    label: "Software",
    icon: Code,
    items: [
      { id: "oracle", label: "Oracle" },
      { id: "veeam", label: "Veeam" },
      { id: "vmware", label: "VMware" },
      { id: "tsplus", label: "TSplus" },
      { id: "prtg", label: "PRTG" },
      { id: "pms-module", label: "PMS-Module" },
    ],
  },
  {
    id: "os",
    label: "OS-Systeme",
    icon: Monitor,
    items: [
      { id: "windows", label: "Windows" },
      { id: "linux", label: "Linux" },
    ],
  },
  {
    id: "lizenzen",
    label: "Lizenzen",
    icon: KeyRound,
    items: [
      { id: "lizenzen", label: "Lizenzen" },
      { id: "servicevertraege", label: "Serviceverträge" },
      { id: "it-service", label: "IT-Service" },
      { id: "oracle-esl", label: "Oracle-ESL" },
    ],
  },
  {
    id: "fernwartung",
    label: "Fernwartung",
    icon: Plug,
    items: [{ id: "fernwartung", label: "Zugänge" }],
  },
];

/** Einzelner Eintrag unter den Gruppen */
export const NAV_LISTS: NavLeaf & { icon: LucideIcon } = { id: "auflistungen", label: "Auflistungen", icon: List };

export function findNavLeaf(id: string): { group?: NavGroup; leaf: NavLeaf } | undefined {
  if (id === NAV_LISTS.id) return { leaf: NAV_LISTS };
  for (const group of NAV_GROUPS) {
    const leaf = group.items.find((i) => i.id === id);
    if (leaf) return { group, leaf };
  }
  return undefined;
}
