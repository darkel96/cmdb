import { useState } from "react";
import { Check, Pencil, Plus, Trash2, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { api } from "@/lib/api";
import { PMS_PRICE_COLUMNS, euro, euroInput, parseEuro, type PmsPrice, type PmsPrices } from "@/lib/pms";
import { PMS_PRICE_LIST, canChangeList } from "@/lib/stammdaten";
import { useAuth } from "@/state/auth";

type Draft = { module: string } & Record<keyof PmsPrices, string>;

const emptyDraft: Draft = { module: "", listPrice: "", licenseCost: "", maintenanceCost: "" };
const toDraft = (p: PmsPrice): Draft => ({ module: p.module, listPrice: euroInput(p.listPrice), licenseCost: euroInput(p.licenseCost), maintenanceCost: euroInput(p.maintenanceCost) });

const th = "whitespace-nowrap px-3 py-2 text-left font-medium text-muted-foreground";
const td = "px-3 py-1.5";

/**
 * Verwaltung › Stammdaten › PMS-Modularten: Preisliste (dbo.PMS_Module_Stammdaten); Recht Stammdaten oder Stammdaten › PMS-Modularten.
 * Neue Preise gelten für künftig hinzugefügte Module; Module an Verträgen behalten ihre Preise. Umbenennen ändert den
 * Namen an den Verträgen mit, Löschen nur ohne Verträge.
 */
export function PmsPriceListPanel({ prices, error: loadError, onChanged }: { prices: PmsPrice[]; error?: string; onChanged: () => Promise<void> }) {
  const { can } = useAuth();
  // editing: Name des bearbeiteten Moduls, "" = neues Modul
  const [editing, setEditing] = useState<string | null>(null);
  const [draft, setDraft] = useState<Draft>(emptyDraft);
  const [confirm, setConfirm] = useState<string | null>(null);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [busy, setBusy] = useState(false);
  const mayEdit = canChangeList(can, PMS_PRICE_LIST.id, "edit");
  const mayDelete = canChangeList(can, PMS_PRICE_LIST.id, "delete");

  async function run(action: "add" | "edit" | "delete", entry: PmsPrice | null, original: PmsPrice | null) {
    setBusy(true);
    setError("");
    setNotice("");
    try {
      const { renamed } = await api.changePmsPrice(action, entry, original);
      if (renamed) setNotice(`Name an ${renamed} Oracle-ESL-Vertr${renamed === 1 ? "ag" : "ägen"} mit geändert.`);
      setEditing(null);
      setConfirm(null);
      await onChanged();
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
      // Löschen abgelehnt (z. B. noch an Verträgen): Rückfrage schließen, Meldung bleibt; beim Bearbeiten bleibt der Editor offen
      setConfirm(null);
    } finally {
      setBusy(false);
    }
  }

  function save(original: PmsPrice | null) {
    const module = draft.module.trim();
    if (!module) return setError("Bitte einen Namen für das Modul angeben.");
    const entry = { module } as PmsPrice;
    for (const c of PMS_PRICE_COLUMNS) {
      const value = parseEuro(draft[c.key]);
      if (value === undefined) return setError(`${c.label}: ungültiger Betrag (z. B. 1.234,50).`);
      entry[c.key] = value;
    }
    void run(original ? "edit" : "add", entry, original);
  }

  const editor = (original: PmsPrice | null) => (
    <tr className="border-b bg-accent/40" key={original?.module ?? "neu"}>
      <td className={td}>
        <Input
          autoFocus
          aria-label="Name des Moduls"
          maxLength={255}
          className="h-8"
          value={draft.module}
          onChange={(e) => setDraft({ ...draft, module: e.target.value })}
          onKeyDown={(e) => (e.key === "Enter" ? save(original) : e.key === "Escape" && setEditing(null))}
        />
      </td>
      {PMS_PRICE_COLUMNS.map((c) => (
        <td key={c.key} className={td}>
          <Input
            aria-label={c.label}
            inputMode="decimal"
            className="h-8 text-right tabular-nums"
            value={draft[c.key]}
            onChange={(e) => setDraft({ ...draft, [c.key]: e.target.value })}
            onKeyDown={(e) => (e.key === "Enter" ? save(original) : e.key === "Escape" && setEditing(null))}
          />
        </td>
      ))}
      <td className={`${td} whitespace-nowrap text-right`}>
        <Button type="button" size="sm" className="h-7 px-2" aria-label="Übernehmen" disabled={busy} onClick={() => save(original)}>
          <Check aria-hidden />
        </Button>
        <Button type="button" variant="ghost" size="sm" className="h-7 px-2" aria-label="Abbrechen" onClick={() => (setEditing(null), setError(""))}>
          <X aria-hidden />
        </Button>
      </td>
    </tr>
  );

  return (
    <section className="animate-appear flex min-h-0 flex-col overflow-hidden rounded-lg border bg-card shadow-xs" aria-label="PMS-Modularten">
      <div className="flex flex-wrap items-center gap-2 border-b px-4 py-3">
        <div className="mr-auto">
          <h2 className="font-semibold">PMS-Modularten</h2>
          <p className="text-xs text-muted-foreground">
            Preisliste für „Modul hinzufügen“ am Oracle-ESL-Vertrag. Neue Preise gelten für künftig hinzugefügte Module, vorhandene behalten ihre Preise.
          </p>
        </div>
        {canChangeList(can, PMS_PRICE_LIST.id, "create") && !loadError && (
          <Button type="button" size="sm" onClick={() => (setEditing(""), setDraft(emptyDraft), setConfirm(null), setError(""))}>
            <Plus aria-hidden />
            Modul hinzufügen
          </Button>
        )}
      </div>
      {loadError && <p className="px-4 py-3 text-sm text-destructive">{loadError}</p>}
      {error && <p role="alert" className="px-4 pt-2 text-sm text-destructive">{error}</p>}
      {notice && <p role="status" className="px-4 pt-2 text-sm text-success">{notice}</p>}
      <div className="scroll-thin overflow-x-auto">
        <table className="w-full text-sm">
          <thead className="border-b">
            <tr>
              <th className={th}>PMS-Modul</th>
              {PMS_PRICE_COLUMNS.map((c) => (
                <th key={c.key} className={`${th} text-right`}>
                  {c.label}
                </th>
              ))}
              <th className={th}>
                <span className="sr-only">Aktionen</span>
              </th>
            </tr>
          </thead>
          <tbody>
            {editing === "" && editor(null)}
            {prices.map((p) =>
              editing === p.module ? (
                editor(p)
              ) : (
                <tr key={p.module} className="group border-b last:border-0 hover:bg-accent">
                  <td className={td}>{p.module}</td>
                  {PMS_PRICE_COLUMNS.map((c) => (
                    <td key={c.key} className={`${td} text-right tabular-nums`}>
                      {euro(p[c.key])}
                    </td>
                  ))}
                  <td className={`${td} whitespace-nowrap text-right`}>
                    {confirm === p.module ? (
                      <span role="alertdialog" aria-label={`${p.module} löschen`} className="inline-flex items-center gap-1">
                        „{p.module}“ löschen?
                        <Button type="button" size="sm" className="h-7 bg-destructive px-2 hover:bg-destructive/90" disabled={busy} onClick={() => void run("delete", null, p)}>
                          Ja, löschen
                        </Button>
                        <Button type="button" variant="ghost" size="sm" className="h-7 px-2" onClick={() => setConfirm(null)}>
                          Abbrechen
                        </Button>
                      </span>
                    ) : (
                      <>
                        {mayEdit && (
                          <Button type="button" variant="ghost" size="sm" className="h-7 px-1.5" aria-label={`${p.module} bearbeiten`} onClick={() => (setEditing(p.module), setDraft(toDraft(p)), setConfirm(null), setError(""))}>
                            <Pencil aria-hidden />
                          </Button>
                        )}
                        {mayDelete && (
                          <Button type="button" variant="ghost" size="sm" className="h-7 px-1.5 text-destructive hover:text-destructive" aria-label={`${p.module} löschen`} onClick={() => (setConfirm(p.module), setEditing(null), setError(""))}>
                            <Trash2 aria-hidden />
                          </Button>
                        )}
                      </>
                    )}
                  </td>
                </tr>
              ),
            )}
            {prices.length === 0 && editing !== "" && !loadError && (
              <tr>
                <td colSpan={5} className="px-4 py-3 text-muted-foreground">
                  Keine Module in der Preisliste.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </section>
  );
}
