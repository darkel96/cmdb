import { useCallback, useEffect, useState } from "react";
import { Pencil, Plus, Shield, Trash2, User, Users, X } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { api, type AdminRolesResponse, type RoleInput } from "@/lib/api";
import { ACTIONS, allPermissions, type Action, type Role, type RoleMember } from "@/lib/permissions";
import { cn } from "@/lib/utils";
import { SchemaHint } from "./SchemaHint";

const NONE = { read: false, create: false, edit: false, delete: false };

function summary(role: Role): string {
  const parts = ACTIONS.map((a) => ({ label: a.label, n: Object.values(role.permissions).filter((p) => p[a.id]).length })).filter((x) => x.n > 0);
  return parts.length ? parts.map((x) => `${x.label}: ${x.n} Bereiche`).join(" · ") : "Keine Rechte";
}

/** Rolle bearbeiten: Name, Beschreibung, Rechte je Bereich (Tabelle mit Häkchen) und Mitglieder */
function RoleEditor({ role, areas, onSave, onCancel }: { role?: Role; areas: AdminRolesResponse["areas"]; onSave: (input: RoleInput) => Promise<void>; onCancel: () => void }) {
  const [name, setName] = useState(role?.name ?? "");
  const [description, setDescription] = useState(role?.description ?? "");
  const [permissions, setPermissions] = useState(role?.permissions ?? allPermissions(NONE));
  const [members, setMembers] = useState<RoleMember[]>(role?.members ?? []);
  const [memberKind, setMemberKind] = useState<RoleMember["kind"]>("user");
  const [memberName, setMemberName] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);

  function toggle(area: string, action: Action, value: boolean) {
    setPermissions((p) => {
      const next = { ...(p[area] ?? NONE), [action]: value };
      // Anlegen, Bearbeiten oder Löschen setzt Lesen voraus; ohne Lesen entfällt alles
      if (value && action !== "read") next.read = true;
      if (!value && action === "read") Object.assign(next, NONE);
      return { ...p, [area]: next };
    });
  }

  function toggleColumn(action: Action) {
    const all = areas.every((a) => permissions[a.id]?.[action]);
    for (const a of areas) toggle(a.id, action, !all);
  }

  function addMember() {
    const value = memberName.trim().toLowerCase();
    if (!value) return;
    if (!members.some((m) => m.kind === memberKind && m.name === value)) setMembers([...members, { kind: memberKind, name: value }]);
    setMemberName("");
  }

  async function save() {
    if (!name.trim()) {
      setError("Bitte einen Namen angeben.");
      return;
    }
    setBusy(true);
    setError("");
    try {
      await onSave({ name: name.trim(), description, permissions, members });
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(false);
    }
  }

  return (
    <section className="animate-appear overflow-hidden rounded-lg border bg-card shadow-xs" aria-label={role ? `Rolle ${role.name} bearbeiten` : "Neue Rolle"}>
      <h2 className="bg-brand px-4 py-2.5 text-lg font-medium text-brand-foreground">{role ? `Rolle bearbeiten: ${role.name}` : "Neue Rolle"}</h2>
      <div className="flex flex-col gap-5 p-4">
        {error && <p role="alert" className="rounded-md border border-destructive/30 bg-destructive/10 px-3 py-2 text-sm text-destructive">{error}</p>}
        <div className="grid gap-4 sm:grid-cols-2">
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="role-name">Name</Label>
            <Input id="role-name" value={name} maxLength={100} disabled={role?.isDefault} onChange={(e) => setName(e.target.value)} />
          </div>
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="role-description">Beschreibung</Label>
            <Input id="role-description" value={description} maxLength={500} onChange={(e) => setDescription(e.target.value)} />
          </div>
        </div>

        <div className="overflow-x-auto rounded-md border">
          <table className="w-full text-sm" aria-label="Rechte je Bereich">
            <thead className="bg-muted text-left text-muted-foreground">
              <tr>
                <th className="px-3 py-2 font-medium">Bereich</th>
                {ACTIONS.map((a) => (
                  <th key={a.id} className="w-28 px-3 py-2 text-center font-medium">
                    <button type="button" className="hover:text-foreground" onClick={() => toggleColumn(a.id)} title={`${a.label} für alle Bereiche umschalten`}>
                      {a.label}
                    </button>
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {areas.map((area) => (
                <tr key={area.id} className="border-t odd:bg-muted/40">
                  <td className="px-3 py-1.5">{area.label}</td>
                  {ACTIONS.map((a) => (
                    <td key={a.id} className="px-3 py-1.5 text-center">
                      <input
                        type="checkbox"
                        aria-label={`${area.label}: ${a.label}`}
                        className="size-4 accent-[var(--brand)]"
                        checked={Boolean(permissions[area.id]?.[a.id])}
                        onChange={(e) => toggle(area.id, a.id, e.target.checked)}
                      />
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        {role?.isDefault ? (
          <p className="text-sm text-muted-foreground">Die Grundrolle gilt für jede angemeldete Person, Mitglieder gibt es hier nicht.</p>
        ) : (
          <div className="flex flex-col gap-2">
            <span className="text-sm font-medium">Mitglieder</span>
            <ul className="flex flex-wrap gap-2" aria-label="Mitglieder">
              {members.map((m) => (
                <li key={`${m.kind}:${m.name}`} className="inline-flex items-center gap-1.5 rounded-md border bg-muted px-2 py-1 text-sm">
                  {m.kind === "user" ? <User className="size-3.5" aria-hidden /> : <Users className="size-3.5" aria-hidden />}
                  {m.name}
                  <span className="text-xs text-muted-foreground">{m.kind === "user" ? "Person" : "AD-Gruppe"}</span>
                  <button type="button" aria-label={`${m.name} entfernen`} className="rounded p-0.5 hover:bg-accent" onClick={() => setMembers(members.filter((x) => x !== m))}>
                    <X className="size-3.5" aria-hidden />
                  </button>
                </li>
              ))}
              {members.length === 0 && <li className="text-sm text-muted-foreground">Noch keine Mitglieder.</li>}
            </ul>
            <div className="flex flex-wrap items-center gap-2">
              <div role="radiogroup" aria-label="Art des Mitglieds" className="inline-flex rounded-md border p-0.5">
                {(["user", "group"] as const).map((k) => (
                  <button
                    key={k}
                    type="button"
                    role="radio"
                    aria-checked={memberKind === k}
                    onClick={() => setMemberKind(k)}
                    className={cn("rounded px-3 py-1 text-sm transition-colors", memberKind === k ? "bg-brand text-brand-foreground" : "hover:bg-accent")}
                  >
                    {k === "user" ? "Person" : "AD-Gruppe"}
                  </button>
                ))}
              </div>
              <Input
                aria-label={memberKind === "user" ? "Anmeldename" : "Name der AD-Gruppe"}
                placeholder={memberKind === "user" ? "Anmeldename, z. B. max.muster" : "AD-Gruppe (CN), z. B. CMDB-Bearbeiter"}
                className="h-8 max-w-80"
                value={memberName}
                onChange={(e) => setMemberName(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter") {
                    e.preventDefault();
                    addMember();
                  }
                }}
              />
              <Button type="button" variant="outline" size="sm" onClick={addMember}>
                <Plus aria-hidden />
                Hinzufügen
              </Button>
            </div>
          </div>
        )}

        <div className="flex gap-2">
          <Button type="button" size="sm" disabled={busy} onClick={() => void save()}>
            {busy ? "Wird gespeichert …" : "Rolle speichern"}
          </Button>
          <Button type="button" variant="outline" size="sm" onClick={onCancel}>
            Abbrechen
          </Button>
        </div>
      </div>
    </section>
  );
}

/** Reiter Rollen: Rollen mit Rechten je Bereich, Mitglieder sind Personen oder AD-Gruppen */
export function RolesTab() {
  const [data, setData] = useState<AdminRolesResponse | null>(null);
  const [error, setError] = useState("");
  const [editing, setEditing] = useState<Role | "new" | null>(null);
  const [confirm, setConfirm] = useState<Role | null>(null);

  const load = useCallback(() => {
    api.adminRoles().then(setData, (e: unknown) => setError(e instanceof Error ? e.message : String(e)));
  }, []);
  useEffect(load, [load]);

  if (error) return <p role="alert" className="text-sm text-destructive">{error}</p>;
  if (!data) return <p className="text-sm text-muted-foreground">Wird geladen …</p>;

  if (editing)
    return (
      <RoleEditor
        role={editing === "new" ? undefined : editing}
        areas={data.areas}
        onCancel={() => setEditing(null)}
        onSave={async (input) => {
          await api.saveRole(editing === "new" ? undefined : editing.id, input);
          setEditing(null);
          load();
        }}
      />
    );

  return (
    <div className="flex flex-col gap-3">
      <SchemaHint schema={data.schema} />
      <div className="flex flex-wrap items-center justify-between gap-2">
        <p className="text-sm text-muted-foreground">Admins (CMDB_ADMINS) dürfen immer alles. Alle anderen bekommen die Rechte der Grundrolle und ihrer Rollen zusammen.</p>
        <Button size="sm" disabled={!data.schema.ready} onClick={() => setEditing("new")}>
          <Plus aria-hidden />
          Neue Rolle
        </Button>
      </div>
      <ul className="grid gap-3 lg:grid-cols-2" aria-label="Rollen">
        {data.items.map((role, i) => (
          <li key={role.id} className="animate-appear flex flex-col gap-2 rounded-lg border bg-card p-4 shadow-xs" style={{ "--i": i } as React.CSSProperties}>
            <div className="flex items-start justify-between gap-2">
              <div className="flex items-center gap-2">
                <Shield className="size-4 text-brand" aria-hidden />
                <span className="font-medium">{role.name}</span>
                {role.isDefault && <Badge variant="secondary">Grundrolle</Badge>}
              </div>
              <div className="flex gap-1">
                <Button variant="ghost" size="sm" aria-label={`${role.name} bearbeiten`} onClick={() => setEditing(role)}>
                  <Pencil aria-hidden />
                </Button>
                {!role.isDefault && (
                  <Button variant="ghost" size="sm" className="text-destructive hover:text-destructive" aria-label={`${role.name} löschen`} onClick={() => setConfirm(role)}>
                    <Trash2 aria-hidden />
                  </Button>
                )}
              </div>
            </div>
            {role.description && <p className="text-sm text-muted-foreground">{role.description}</p>}
            <p className="text-xs text-muted-foreground">{summary(role)}</p>
            {!role.isDefault && (
              <p className="text-xs">
                {role.members.length ? role.members.map((m) => `${m.kind === "user" ? "Person" : "Gruppe"} ${m.name}`).join(", ") : "Keine Mitglieder"}
              </p>
            )}
            {confirm?.id === role.id && (
              <div role="alertdialog" aria-label="Rolle löschen" className="flex flex-wrap items-center justify-between gap-2 rounded-md border border-destructive/30 bg-destructive/10 px-3 py-2 text-sm">
                <span>Rolle „{role.name}“ wirklich löschen?</span>
                <span className="flex gap-2">
                  <Button
                    size="sm"
                    className="bg-destructive hover:bg-destructive/90"
                    onClick={async () => {
                      try {
                        await api.deleteRole(role.id);
                        setConfirm(null);
                        load();
                      } catch (e) {
                        setError(e instanceof Error ? e.message : String(e));
                      }
                    }}
                  >
                    Ja, löschen
                  </Button>
                  <Button size="sm" variant="outline" onClick={() => setConfirm(null)}>
                    Abbrechen
                  </Button>
                </span>
              </div>
            )}
          </li>
        ))}
      </ul>
    </div>
  );
}
