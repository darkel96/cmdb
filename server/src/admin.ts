/**
 * Anmelde-Protokoll und Rollen mit Rechten je Bereich. Gespeichert im Schema cmdb (Migration 001),
 * im Testmodus nur im Speicher. Ein Fehler hier verhindert nie die Anmeldung selbst.
 */
import sql from "mssql";
import type { SessionUser } from "@/lib/types";
import { PERMISSION_AREAS, READ_ALL, allPermissions, mergePermissions, type LoginLogEntry, type Permissions, type Role, type RoleMember } from "@/lib/permissions";
import { DbError, pool } from "./db";
import { ENV } from "./env";
import { log } from "./log";
import { migrate } from "./migrations";

export interface LoginEvent {
  username: string;
  displayName?: string;
  success: boolean;
  reason?: string;
  address: string;
}

/** Zustand des Schemas cmdb, für die Verwaltung */
export const schemaState: { ready: boolean; error?: string } = { ready: false };

// ---------- Testmodus: alles im Speicher ----------
const memLog: LoginLogEntry[] = [];
let memRoles: Role[] = [{ id: 1, name: "Alle Angemeldeten", description: "Gilt für jede angemeldete Person", isDefault: true, permissions: READ_ALL, members: [] }];

// ---------- SQL Server ----------
async function ready(): Promise<sql.ConnectionPool> {
  if (!schemaState.ready) throw new DbError(schemaState.error ?? "Das Schema cmdb ist noch nicht eingerichtet.", 503);
  return pool();
}

/** Beim Start: Schema prüfen, Migrationen einspielen, Grundrolle mit Leserecht für alle Bereiche ergänzen */
export async function initAdminStore(): Promise<void> {
  if (ENV.testMode) {
    schemaState.ready = true;
    return;
  }
  try {
    const p = await pool();
    await migrate(p);
    // Neue Bereiche bekommen in der Grundrolle Leserecht, wie bisher
    for (const area of PERMISSION_AREAS) {
      await p.request().input("area", sql.NVarChar(50), area.id).query(`INSERT INTO cmdb.RolePermission (RoleId, Area, CanRead)
        SELECT r.Id, @area, 1 FROM cmdb.Role r WHERE r.IsDefault = 1 AND NOT EXISTS (SELECT 1 FROM cmdb.RolePermission p WHERE p.RoleId = r.Id AND p.Area = @area)`);
    }
    schemaState.ready = true;
    schemaState.error = undefined;
    log("Schema cmdb bereit (Anmelde-Protokoll, Rollen)");
  } catch (e) {
    schemaState.ready = false;
    schemaState.error = e instanceof Error ? e.message : String(e);
    log(`Schema cmdb nicht bereit: ${schemaState.error}`);
  }
}

export async function recordLogin(event: LoginEvent): Promise<void> {
  if (ENV.testMode) {
    memLog.unshift({ id: memLog.length + 1, at: new Date().toISOString(), username: event.username, displayName: event.displayName ?? "", success: event.success, reason: event.reason ?? "", address: event.address });
    memLog.length = Math.min(memLog.length, 1000);
    return;
  }
  if (!schemaState.ready) return;
  try {
    const p = await pool();
    await p
      .request()
      .input("u", sql.NVarChar(64), event.username.slice(0, 64))
      .input("d", sql.NVarChar(256), event.displayName ?? null)
      .input("s", sql.Bit, event.success)
      .input("r", sql.NVarChar(200), event.reason?.slice(0, 200) ?? null)
      .input("a", sql.NVarChar(64), event.address.slice(0, 64))
      .query("INSERT INTO cmdb.LoginLog (Username, DisplayName, Success, Reason, Address) VALUES (@u, @d, @s, @r, @a); DELETE FROM cmdb.LoginLog WHERE At < DATEADD(day, -365, SYSUTCDATETIME())");
  } catch (e) {
    log(`Anmelde-Protokoll nicht geschrieben: ${e instanceof Error ? e.message : String(e)}`);
  }
}

export async function listLogins(limit = 1000): Promise<LoginLogEntry[]> {
  if (ENV.testMode) return memLog.slice(0, limit);
  const r = await (await ready())
    .request()
    .input("n", sql.Int, limit)
    .query<{ Id: number; At: Date; Username: string; DisplayName: string | null; Success: boolean; Reason: string | null; Address: string | null }>(
      "SELECT TOP (@n) Id, At, Username, DisplayName, Success, Reason, Address FROM cmdb.LoginLog ORDER BY At DESC, Id DESC",
    );
  return r.recordset.map((x) => ({ id: x.Id, at: x.At.toISOString(), username: x.Username, displayName: x.DisplayName ?? "", success: x.Success, reason: x.Reason ?? "", address: x.Address ?? "" }));
}

let roleCache: { at: number; roles: Role[] } | undefined;

export async function listRoles(): Promise<Role[]> {
  if (ENV.testMode) return memRoles;
  if (roleCache && Date.now() - roleCache.at < 30_000) return roleCache.roles;
  const p = await ready();
  const roles = (await p.request().query<{ Id: number; Name: string; Description: string | null; IsDefault: boolean; ChangedBy: string | null; ChangedAt: Date }>(
    "SELECT Id, Name, Description, IsDefault, ChangedBy, ChangedAt FROM cmdb.Role ORDER BY IsDefault DESC, Name",
  )).recordset;
  const perms = (await p.request().query<{ RoleId: number; Area: string; CanRead: boolean; CanCreate: boolean; CanEdit: boolean; CanDelete: boolean }>("SELECT * FROM cmdb.RolePermission")).recordset;
  const members = (await p.request().query<{ RoleId: number; Kind: "user" | "group"; Name: string }>("SELECT RoleId, Kind, Name FROM cmdb.RoleMember ORDER BY Kind DESC, Name")).recordset;
  const result = roles.map((r) => {
    const permissions = allPermissions({ read: false, create: false, edit: false, delete: false });
    for (const x of perms.filter((x) => x.RoleId === r.Id)) if (permissions[x.Area]) permissions[x.Area] = { read: x.CanRead, create: x.CanCreate, edit: x.CanEdit, delete: x.CanDelete };
    return {
      id: r.Id, name: r.Name, description: r.Description ?? "", isDefault: r.IsDefault, permissions,
      members: members.filter((m) => m.RoleId === r.Id).map((m) => ({ kind: m.Kind, name: m.Name })),
      changedBy: r.ChangedBy ?? undefined, changedAt: r.ChangedAt.toISOString(),
    };
  });
  roleCache = { at: Date.now(), roles: result };
  return result;
}

export interface RoleInput {
  name: string;
  description: string;
  permissions: Permissions;
  members: RoleMember[];
}

/** Rolle anlegen (id undefined) oder ändern; Name eindeutig, Mitglieder klein geschrieben */
export async function saveRole(id: number | undefined, input: RoleInput, by: string): Promise<number> {
  const members = [...new Map(input.members.map((m) => [`${m.kind}:${m.name.trim().toLowerCase()}`, { kind: m.kind, name: m.name.trim().toLowerCase() }])).values()].filter((m) => m.name);
  if (ENV.testMode) {
    if (memRoles.some((r) => r.name.toLowerCase() === input.name.toLowerCase() && r.id !== id)) throw new DbError(`Die Rolle „${input.name}“ gibt es schon.`, 409);
    const existing = memRoles.find((r) => r.id === id);
    if (id !== undefined && !existing) throw new DbError("Diese Rolle gibt es nicht.", 404);
    const role: Role = { id: id ?? Math.max(0, ...memRoles.map((r) => r.id)) + 1, name: existing?.isDefault ? existing.name : input.name, description: input.description, isDefault: existing?.isDefault ?? false, permissions: input.permissions, members: existing?.isDefault ? [] : members, changedBy: by, changedAt: new Date().toISOString() };
    memRoles = id === undefined ? [...memRoles, role] : memRoles.map((r) => (r.id === id ? role : r));
    return role.id;
  }
  const p = await ready();
  const tx = new sql.Transaction(p);
  await tx.begin(sql.ISOLATION_LEVEL.SERIALIZABLE);
  try {
    const dup = await new sql.Request(tx).input("name", sql.NVarChar(100), input.name).input("id", sql.Int, id ?? 0)
      .query<{ n: number }>("SELECT COUNT(*) AS n FROM cmdb.Role WHERE Name = @name AND Id <> @id");
    if (dup.recordset[0].n) throw new DbError(`Die Rolle „${input.name}“ gibt es schon.`, 409);
    let roleId = id;
    if (roleId === undefined) {
      const r = await new sql.Request(tx).input("name", sql.NVarChar(100), input.name).input("d", sql.NVarChar(500), input.description || null).input("by", sql.NVarChar(64), by)
        .query<{ Id: number }>("INSERT INTO cmdb.Role (Name, Description, ChangedBy) OUTPUT INSERTED.Id VALUES (@name, @d, @by)");
      roleId = r.recordset[0].Id;
    } else {
      const r = await new sql.Request(tx).input("id", sql.Int, roleId).input("name", sql.NVarChar(100), input.name).input("d", sql.NVarChar(500), input.description || null).input("by", sql.NVarChar(64), by)
        .query("UPDATE cmdb.Role SET Name = CASE WHEN IsDefault = 1 THEN Name ELSE @name END, Description = @d, ChangedBy = @by, ChangedAt = SYSUTCDATETIME() WHERE Id = @id");
      if (!r.rowsAffected[0]) throw new DbError("Diese Rolle gibt es nicht.", 404);
      await new sql.Request(tx).input("id", sql.Int, roleId).query("DELETE FROM cmdb.RolePermission WHERE RoleId = @id; DELETE FROM cmdb.RoleMember WHERE RoleId = @id");
    }
    // Jeder Bereich bekommt eine Zeile, auch ohne Rechte: sonst würde der Start der Grundrolle das entzogene
    // Leserecht als „neuer Bereich“ wieder eintragen
    for (const area of PERMISSION_AREAS) {
      const x = input.permissions[area.id] ?? { read: false, create: false, edit: false, delete: false };
      await new sql.Request(tx).input("id", sql.Int, roleId).input("a", sql.NVarChar(50), area.id).input("r", sql.Bit, x.read).input("c", sql.Bit, x.create).input("e", sql.Bit, x.edit).input("d", sql.Bit, x.delete)
        .query("INSERT INTO cmdb.RolePermission (RoleId, Area, CanRead, CanCreate, CanEdit, CanDelete) VALUES (@id, @a, @r, @c, @e, @d)");
    }
    const isDefault = (await new sql.Request(tx).input("id", sql.Int, roleId).query<{ IsDefault: boolean }>("SELECT IsDefault FROM cmdb.Role WHERE Id = @id")).recordset[0]?.IsDefault;
    if (!isDefault) for (const m of members) {
      await new sql.Request(tx).input("id", sql.Int, roleId).input("k", sql.VarChar(10), m.kind).input("n", sql.NVarChar(256), m.name)
        .query("INSERT INTO cmdb.RoleMember (RoleId, Kind, Name) VALUES (@id, @k, @n)");
    }
    await tx.commit();
    roleCache = undefined;
    return roleId;
  } catch (e) {
    await tx.rollback().catch(() => undefined);
    if (e instanceof DbError) throw e;
    throw new DbError(`Rolle nicht gespeichert: ${e instanceof Error ? e.message : String(e)}`, 503);
  }
}

export async function deleteRole(id: number): Promise<void> {
  if (ENV.testMode) {
    const role = memRoles.find((r) => r.id === id);
    if (!role) throw new DbError("Diese Rolle gibt es nicht.", 404);
    if (role.isDefault) throw new DbError("Die Grundrolle kann nicht gelöscht werden.", 409);
    memRoles = memRoles.filter((r) => r.id !== id);
    return;
  }
  const r = await (await ready()).request().input("id", sql.Int, id).query("DELETE FROM cmdb.Role WHERE Id = @id AND IsDefault = 0");
  roleCache = undefined;
  if (!r.rowsAffected[0]) throw new DbError("Diese Rolle gibt es nicht oder sie ist die Grundrolle.", 409);
}

/**
 * Rechte einer Person: Admins (CMDB_ADMINS bzw. CMDB_ADMIN_GROUP) dürfen alles. Sonst die Grundrolle plus alle Rollen,
 * in denen die Person oder eine ihrer AD-Gruppen Mitglied ist. Ohne Schema cmdb gilt wie bisher: alle dürfen lesen.
 */
export async function permissionsFor(user: SessionUser & { groups?: string[] }): Promise<Permissions> {
  if (user.role === "admin") return allPermissions();
  let roles: Role[];
  try {
    roles = await listRoles();
  } catch {
    return READ_ALL;
  }
  const groups = new Set((user.groups ?? []).map((g) => g.toLowerCase()));
  const mine = roles.filter((r) => r.isDefault || r.members.some((m) => (m.kind === "user" ? m.name === user.username : groups.has(m.name))));
  return mergePermissions(mine.map((r) => r.permissions));
}
