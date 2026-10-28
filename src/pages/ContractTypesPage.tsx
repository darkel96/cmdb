import { Activity, Boxes, ChevronRight, Database, DatabaseBackup, HardDrive, KeyRound, Laptop, Monitor, MonitorSmartphone, Network, ScanBarcode, Server, type LucideIcon } from "lucide-react";
import { Link } from "react-router";
import { AREAS } from "@/lib/areas";
import { cn } from "@/lib/utils";

/** Typen bei „Anlage Vertrag“ in der Reihenfolge wie in GAPTEQ; Bereiche ohne Formular folgen */
const TYPES: { label: string; icon: LucideIcon; areaId?: string }[] = [
  { label: "Server", icon: Server, areaId: "server" },
  { label: "Switche", icon: Network, areaId: "switche" },
  { label: "MDEs", icon: ScanBarcode },
  { label: "VMware", icon: Boxes },
  { label: "TSPLUS", icon: MonitorSmartphone },
  { label: "PRTG", icon: Activity },
  { label: "VEEAM", icon: DatabaseBackup },
  { label: "Lizenzen", icon: KeyRound },
  { label: "Storage", icon: HardDrive },
  { label: "Oracle", icon: Database },
  { label: "Client", icon: Laptop },
  { label: "Windows-Systeme", icon: Monitor },
];

const tile = "animate-appear flex min-h-28 flex-col justify-between gap-3 rounded-lg border p-4";

/** Typauswahl als Kacheln (wie die Kacheln im KI-Portal) */
export function ContractTypesPage() {
  return (
    <section className="flex w-full flex-col gap-4" aria-label="Anlage Vertrag">
      <h1 className="animate-appear rounded-lg bg-brand px-4 py-2.5 text-lg font-medium text-brand-foreground shadow-xs">Anlage Vertrag</h1>
      <ul className="grid grid-cols-[repeat(auto-fill,minmax(13rem,1fr))] gap-3">
        {TYPES.map((t, i) => {
          const Icon = t.icon;
          const ready = Boolean(t.areaId && AREAS[t.areaId]?.createFields);
          const style = { "--i": i } as React.CSSProperties;
          return (
            <li key={t.label} className="contents">
              {ready ? (
                <Link
                  to={`/bereich/${t.areaId}/neu`}
                  viewTransition
                  style={style}
                  className={cn(tile, "group bg-card shadow-xs transition-[box-shadow,border-color,transform] duration-200 ease-out hover:-translate-y-0.5 hover:border-brand hover:shadow-md active:translate-y-0")}
                >
                  <span className="flex size-10 items-center justify-center rounded-md bg-brand/10 text-brand">
                    <Icon className="size-5" aria-hidden />
                  </span>
                  <span className="flex items-center justify-between gap-2 font-medium">
                    {t.label}
                    <ChevronRight className="size-4 text-brand transition-transform duration-200 group-hover:translate-x-0.5" aria-hidden />
                  </span>
                </Link>
              ) : (
                <span aria-disabled="true" title="Folgt" style={style} className={cn(tile, "border-dashed bg-muted/60 text-muted-foreground")}>
                  <span className="flex size-10 items-center justify-center rounded-md bg-muted">
                    <Icon className="size-5" aria-hidden />
                  </span>
                  <span className="flex items-center justify-between gap-2 font-medium">
                    {t.label}
                    <span className="text-xs font-normal">folgt</span>
                  </span>
                </span>
              )}
            </li>
          );
        })}
      </ul>
    </section>
  );
}
