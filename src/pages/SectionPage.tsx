import { useEffect, useState } from "react";
import { useParams } from "react-router";
import { DataTable, type Column } from "@/components/DataTable";
import { Card, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { api } from "@/lib/api";
import { findNavLeaf, NAV_LISTS } from "@/lib/navigation";
import type { CiListResponse, ConfigurationItem } from "@/lib/types";
import { NotFoundPage } from "./NotFoundPage";
import { AREAS } from "@/lib/areas";
import { AreaPage } from "./AreaPage";

function formatDate(iso: string): string {
  const [y, m, d] = iso.split("-");
  return `${d}.${m}.${y}`;
}

const CI_COLUMNS: Column<ConfigurationItem>[] = [
  { key: "name", label: "Name", value: (c) => c.name, className: "font-mono text-xs" },
  { key: "type", label: "Typ", value: (c) => c.type },
  { key: "company", label: "Firma", value: (c) => c.company },
  { key: "manufacturer", label: "Hersteller / Modell", value: (c) => `${c.manufacturer} · ${c.model}` },
  { key: "status", label: "Status", value: (c) => c.status },
  { key: "supportUntil", label: "Support bis", value: (c) => formatDate(c.supportUntil) },
];

/** Auflistungen: alle CIs über alle Typen (im Testmodus erfunden, sonst ab Phase 1) */
function ListsPage() {
  const [data, setData] = useState<CiListResponse | null>(null);
  const [error, setError] = useState("");
  useEffect(() => {
    api.cis().then(setData, (e: unknown) => setError(e instanceof Error ? e.message : String(e)));
  }, []);
  if (error) return <p role="alert" className="text-sm text-destructive">{error}</p>;
  if (!data) return <p className="text-sm text-muted-foreground">Wird geladen …</p>;
  if (data.source === "none") return <Placeholder title={NAV_LISTS.label} />;
  return <DataTable title="Configuration Items" columns={CI_COLUMNS} rows={data.items} rowKey={(c) => c.id} exportName="configuration-items" />;
}

function Placeholder({ title, group }: { title: string; group?: string }) {
  return (
    <Card className="animate-appear">
      <CardHeader>
        <CardTitle>{group ? `${group} · ${title}` : title}</CardTitle>
        <CardDescription>Dieser Bereich folgt. Die Daten kommen ab Phase 1 nur lesend aus der bestehenden Datenbank.</CardDescription>
      </CardHeader>
    </Card>
  );
}

/** Bereiche aus der Seitenleiste */
export function SectionPage() {
  const { id = "" } = useParams();
  const found = findNavLeaf(id);
  if (!found) return <NotFoundPage />;
  if (id === NAV_LISTS.id) return <ListsPage />;
  if (Object.hasOwn(AREAS, id)) return <AreaPage area={AREAS[id]} />;
  return <Placeholder title={found.leaf.label} group={found.group?.label} />;
}
