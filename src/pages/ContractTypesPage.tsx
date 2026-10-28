import { Link } from "react-router";
import { AREAS } from "@/lib/areas";

/** Typen bei „Anlage Vertrag“ in der Reihenfolge wie in GAPTEQ; Bereiche ohne Formular folgen */
const TYPES: { label: string; areaId?: string }[] = [
  { label: "Server", areaId: "server" },
  { label: "Switche", areaId: "switche" },
  { label: "MDEs" },
  { label: "VMware" },
  { label: "TSPLUS" },
  { label: "PRTG" },
  { label: "VEEAM" },
  { label: "Lizenzen" },
  { label: "Storage" },
  { label: "Oracle" },
  { label: "Client" },
  { label: "Windows-Systeme" },
];

export function ContractTypesPage() {
  return (
    <section className="animate-appear mx-auto flex w-full max-w-5xl flex-col overflow-hidden rounded-lg border bg-card shadow-xs" aria-label="Anlage Vertrag">
      <h1 className="bg-brand px-4 py-2.5 text-lg font-medium text-brand-foreground">Anlage Vertrag</h1>
      <ul className="flex flex-col gap-2 p-4">
        {TYPES.map((t) => {
          const ready = t.areaId && AREAS[t.areaId]?.createFields;
          return (
            <li key={t.label}>
              {ready ? (
                <Link
                  to={`/bereich/${t.areaId}/neu`}
                  viewTransition
                  className="block rounded-md bg-brand px-4 py-2 text-center text-sm font-medium text-brand-foreground transition-colors duration-150 hover:bg-brand-hover active:translate-y-px"
                >
                  {t.label}
                </Link>
              ) : (
                <span aria-disabled="true" title="Folgt" className="block rounded-md bg-muted px-4 py-2 text-center text-sm text-muted-foreground">
                  {t.label} <span className="text-xs">(folgt)</span>
                </span>
              )}
            </li>
          );
        })}
      </ul>
    </section>
  );
}
