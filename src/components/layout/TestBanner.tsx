import { FlaskConical } from "lucide-react";

/** Deutlicher Hinweis, dass nur Testbenutzer und erfundene Daten im Spiel sind */
export function TestBanner() {
  return (
    <div role="status" data-testid="test-banner" className="flex items-center justify-center gap-2 bg-warning-bg px-4 py-2 text-center text-sm font-semibold text-warning-fg">
      <FlaskConical className="size-4 shrink-0" aria-hidden />
      <span>Testumgebung: Testbenutzer und erfundene Daten, keine echten Systeme</span>
    </div>
  );
}
