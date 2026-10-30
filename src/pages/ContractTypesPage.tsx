import { Activity, Boxes, Cable, ChevronRight, Database, DatabaseBackup, HardDrive, KeyRound, Laptop, Monitor, MonitorSmartphone, Network, ScanBarcode, ScrollText, Server, type LucideIcon } from "lucide-react";
import { Link } from "react-router";
import { AREAS } from "@/lib/areas";
import { useAuth } from "@/state/auth";

/** Typen bei „Anlage Vertrag“ in der Reihenfolge wie in GAPTEQ */
const TYPES: { label: string; icon: LucideIcon; areaId?: string }[] = [
  { label: "Server", icon: Server, areaId: "server" },
  { label: "Switche", icon: Network, areaId: "switche" },
  { label: "MDEs", icon: ScanBarcode, areaId: "mde" },
  { label: "VMware", icon: Boxes, areaId: "vmware" },
  { label: "TSPLUS", icon: MonitorSmartphone, areaId: "tsplus" },
  { label: "PRTG", icon: Activity, areaId: "prtg" },
  { label: "KEPware", icon: Cable, areaId: "kepware" },
  { label: "VEEAM", icon: DatabaseBackup, areaId: "veeam" },
  { label: "Lizenzen", icon: KeyRound, areaId: "lizenzen" },
  { label: "Storage", icon: HardDrive, areaId: "storage" },
  { label: "Oracle", icon: Database, areaId: "oracle" },
  { label: "Client", icon: Laptop, areaId: "client" },
  { label: "Windows-Systeme", icon: Monitor, areaId: "windows" },
  { label: "Oracle-ESL", icon: ScrollText, areaId: "oracle-esl" },
];

const tile =
  "group animate-appear flex min-h-28 flex-col justify-between gap-3 rounded-lg border bg-card p-4 shadow-xs transition-[box-shadow,border-color,transform] duration-200 ease-out hover:-translate-y-0.5 hover:border-brand hover:shadow-md active:translate-y-0";

/** Typauswahl als Kacheln (wie die Kacheln im KI-Portal), nur Typen mit dem Recht Anlegen */
export function ContractTypesPage() {
  const { can } = useAuth();
  const types = TYPES.filter((t) => t.areaId && AREAS[t.areaId]?.createFields && can(t.areaId, "create"));
  return (
    <section className="flex w-full flex-col gap-4" aria-label="Anlage Vertrag">
      <ul className="grid grid-cols-[repeat(auto-fill,minmax(13rem,1fr))] gap-3">
        {types.map((t, i) => {
          const Icon = t.icon;
          return (
            <li key={t.label} className="contents">
              <Link to={`/bereich/${t.areaId}/neu`} viewTransition style={{ "--i": i } as React.CSSProperties} className={tile}>
                <span className="flex size-10 items-center justify-center rounded-md bg-brand/10 text-brand">
                  <Icon className="size-5" aria-hidden />
                </span>
                <span className="flex items-center justify-between gap-2 font-medium">
                  {t.label}
                  <ChevronRight className="size-4 text-brand transition-transform duration-200 group-hover:translate-x-0.5" aria-hidden />
                </span>
              </Link>
            </li>
          );
        })}
      </ul>
    </section>
  );
}
