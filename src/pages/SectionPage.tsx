import { useParams } from "react-router";
import { Card, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { findNavLeaf, NAV_LISTS } from "@/lib/navigation";
import { NotFoundPage } from "./NotFoundPage";
import { AREAS } from "@/lib/areas";
import { AreaPage } from "./AreaPage";
import { ReportsIndex } from "./ReportsPage";

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
  if (id === NAV_LISTS.id) return <ReportsIndex />;
  if (Object.hasOwn(AREAS, id)) return <AreaPage area={AREAS[id]} />;
  return <Placeholder title={found.leaf.label} group={found.group?.label} />;
}
