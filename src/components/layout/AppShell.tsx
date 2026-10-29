import { useEffect, useState } from "react";
import { ChevronDown, Database, Home, LogOut, Menu, PanelLeftClose, PanelLeftOpen, Settings, User } from "lucide-react";
import { NavLink, Navigate, Outlet, useLocation } from "react-router";
import { Badge } from "@/components/ui/badge";
import { visibleAdminTabs } from "@/lib/adminTabs";
import { NAV_GROUPS, NAV_LISTS, type NavGroup } from "@/lib/navigation";
import { cn } from "@/lib/utils";
import { useAuth } from "@/state/auth";
import { BrandLogo } from "@/components/Branding";
import { TestBanner } from "./TestBanner";

const ROLE_LABEL = { admin: "Admin", user: "Benutzer" } as const;

const itemClass = ({ isActive }: { isActive: boolean }) =>
  cn("flex items-center gap-3 rounded-md px-3 py-2 text-sm font-medium text-sidebar-foreground/90 transition-colors duration-150 hover:bg-sidebar-accent hover:text-sidebar-foreground", isActive && "bg-sidebar-accent text-sidebar-foreground");

/** Text neben dem Symbol; eingeklappt nur für Screenreader */
function ItemLabel({ collapsed, children, className }: { collapsed: boolean; children: React.ReactNode; className?: string }) {
  return <span className={cn(collapsed ? "sr-only" : "truncate", className)}>{children}</span>;
}

const COLLAPSED_KEY = "cmdb-seitenleiste-eingeklappt";

function readCollapsed(): boolean {
  try {
    return localStorage.getItem(COLLAPSED_KEY) === "1";
  } catch {
    return false;
  }
}

function SidebarGroup({ group, onNavigate, collapsed, onExpand }: { group: NavGroup; onNavigate: () => void; collapsed: boolean; onExpand: () => void }) {
  const location = useLocation();
  const containsActive = group.items.some((i) => location.pathname === `/bereich/${i.id}` || location.pathname.startsWith(`/bereich/${i.id}/`));
  const [open, setOpen] = useState(containsActive);
  useEffect(() => {
    if (containsActive) setOpen(true);
  }, [containsActive]);
  const Icon = group.icon;
  return (
    <li>
      <button
        type="button"
        onClick={() => {
          // Eingeklappt: Leiste aufklappen und die Gruppe öffnen
          if (collapsed) {
            onExpand();
            setOpen(true);
          } else setOpen((o) => !o);
        }}
        aria-expanded={open && !collapsed}
        title={collapsed ? group.label : undefined}
        className={cn(
          "flex w-full items-center gap-3 rounded-md px-3 py-2 text-sm font-medium text-sidebar-foreground/90 transition-colors duration-150 hover:bg-sidebar-accent hover:text-sidebar-foreground",
          collapsed && containsActive && "bg-sidebar-accent text-sidebar-foreground",
        )}
      >
        <Icon className="size-5 shrink-0" aria-hidden />
        <ItemLabel collapsed={collapsed} className="flex-1 text-left">{group.label}</ItemLabel>
        {!collapsed && <ChevronDown className={cn("size-4 shrink-0 transition-transform duration-200 ease-out", open && "rotate-180")} aria-hidden />}
      </button>
      <div className={cn("grid transition-[grid-template-rows,opacity] duration-200 ease-out", open && !collapsed ? "grid-rows-[1fr] opacity-100" : "grid-rows-[0fr] opacity-0")} inert={!open || collapsed}>
        <ul className="mt-0.5 mb-1 ml-8 flex min-h-0 flex-col gap-0.5 overflow-hidden border-l border-sidebar-foreground/20 pl-2">
          {group.items.map((item) => (
            <li key={item.id}>
              <NavLink to={`/bereich/${item.id}`} viewTransition className={itemClass} onClick={onNavigate}>
                {item.label}
              </NavLink>
            </li>
          ))}
        </ul>
      </div>
    </li>
  );
}

function Sidebar({ onNavigate, collapsed = false, onExpand = () => undefined }: { onNavigate: () => void; collapsed?: boolean; onExpand?: () => void }) {
  const ListIcon = NAV_LISTS.icon;
  return (
    <nav aria-label="Hauptnavigation" className="flex h-full flex-col text-sidebar-foreground">
      {/* Nur die Einträge scrollen; das Logo darunter bleibt fest */}
      <div className="scroll-thin min-h-0 flex-1 overflow-x-hidden p-2">
      <ul className="flex flex-col gap-0.5">
        <li>
          <NavLink to="/" end viewTransition className={itemClass} onClick={onNavigate} title={collapsed ? "Startseite" : undefined}>
            <Home className="size-5 shrink-0" aria-hidden />
            <ItemLabel collapsed={collapsed}>Startseite</ItemLabel>
          </NavLink>
        </li>
        {NAV_GROUPS.map((g) => (
          <SidebarGroup key={g.id} group={g} onNavigate={onNavigate} collapsed={collapsed} onExpand={onExpand} />
        ))}
        <li>
          <NavLink to={`/bereich/${NAV_LISTS.id}`} viewTransition className={itemClass} onClick={onNavigate} title={collapsed ? NAV_LISTS.label : undefined}>
            <ListIcon className="size-5 shrink-0" aria-hidden />
            <ItemLabel collapsed={collapsed}>{NAV_LISTS.label}</ItemLabel>
          </NavLink>
        </li>
      </ul>
      </div>
      {/* Logo unten in der Seitenleiste (nur mit lokalem Branding), eingeklappt kleiner */}
      <div className="flex shrink-0 justify-center pt-3 pb-3 opacity-90">
        <BrandLogo variant="weiss" className={collapsed ? "h-6 w-auto" : "h-11 w-auto"} fallback={null} />
      </div>
    </nav>
  );
}

const topButton = "inline-flex h-9 items-center gap-2 rounded-md bg-white/15 px-3 text-sm font-medium text-brand-foreground transition-all duration-150 ease-out hover:bg-white/25 active:translate-y-px focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white/60";

/** App-Rahmen für angemeldete Personen: Kopfleiste mit Name, Rolle und Abmelden, Seitenleiste mit den Bereichen */
export function AppShell() {
  const { user, testMode, logout, can } = useAuth();
  const location = useLocation();
  // Auf breiten Bildschirmen ist die Seitenleiste immer sichtbar, auf schmalen wird sie über das Menü eingeblendet
  const [menuOpen, setMenuOpen] = useState(false);
  const closeMenu = () => setMenuOpen(false);
  // Breite Bildschirme: Seitenleiste einklappbar auf die Symbole (wie in GAPTEQ), der Browser merkt sich die Wahl
  const [collapsed, setCollapsed] = useState(readCollapsed);
  const toggleCollapsed = (value: boolean) => {
    setCollapsed(value);
    try {
      localStorage.setItem(COLLAPSED_KEY, value ? "1" : "0");
    } catch {
      /* ohne Speicher gilt die Wahl bis zum Neuladen */
    }
  };

  if (user === undefined) return <p className="p-8 text-sm text-muted-foreground">Wird geladen …</p>;
  if (user === null) return <Navigate to="/login" replace state={{ from: location.pathname }} />;

  return (
    // Kopf- und Seitenleiste stehen fest, nur der Inhalt scrollt
    <div className="flex h-svh flex-col overflow-hidden print:block print:h-auto print:overflow-visible">
      {testMode && <div className="print:hidden"><TestBanner /></div>}
      <header className="vt-header flex h-12 print:!hidden shrink-0 items-center gap-2 bg-brand px-2 text-brand-foreground shadow-sm">
        <button type="button" className={cn(topButton, "px-2.5 lg:hidden")} onClick={() => setMenuOpen((o) => !o)} aria-label="Menü ein- oder ausblenden" aria-expanded={menuOpen}>
          <Menu className="size-5" aria-hidden />
        </button>
        <button
          type="button"
          className={cn(topButton, "hidden px-2.5 lg:inline-flex")}
          onClick={() => toggleCollapsed(!collapsed)}
          aria-label="Seitenleiste ein- oder ausklappen"
          aria-expanded={!collapsed}
          title={collapsed ? "Seitenleiste ausklappen" : "Seitenleiste einklappen"}
        >
          {collapsed ? <PanelLeftOpen className="size-5" aria-hidden /> : <PanelLeftClose className="size-5" aria-hidden />}
        </button>
        <div className="flex items-center gap-2 px-2 text-lg font-semibold">
          <BrandLogo variant="weiss" className="h-7 w-auto" fallback={<Database className="size-5" aria-hidden />} />
          CMDB
        </div>
        <div className="ml-auto flex items-center gap-1.5">
          {visibleAdminTabs(user.role === "admin", can).length > 0 && (
            <NavLink to="/verwaltung" viewTransition aria-label="Verwaltung" className={({ isActive }) => cn(topButton, isActive && "bg-white/30")}>
              <Settings className="size-4" aria-hidden />
              <span className="hidden sm:inline">Verwaltung</span>
            </NavLink>
          )}
          <div className={cn(topButton, "cursor-default hover:bg-white/15")} title={`${user.username} · ${user.mail || "keine E-Mail"}`}>
            <User className="size-4" aria-hidden />
            <span className="hidden max-w-48 truncate md:inline" data-testid="user-name">{user.displayName}</span>
            <Badge variant="secondary" className="h-5" data-testid="user-role">{ROLE_LABEL[user.role]}</Badge>
          </div>
          <button type="button" className={topButton} onClick={() => void logout()} aria-label="Abmelden">
            <LogOut className="size-4" aria-hidden />
            <span className="hidden sm:inline">Abmelden</span>
          </button>
        </div>
      </header>
      <div className="relative flex min-h-0 flex-1 print:block">
        <aside data-testid="sidebar" className={cn("vt-sidebar hidden shrink-0 print:!hidden bg-sidebar transition-[width] duration-200 ease-out lg:block", collapsed ? "w-14" : "w-60")}>
          <Sidebar onNavigate={closeMenu} collapsed={collapsed} onExpand={() => toggleCollapsed(false)} />
        </aside>
        {menuOpen && (
          <>
            {/* Schmale Bildschirme: Seitenleiste über dem Inhalt, Klick daneben schliesst sie */}
            <div className="animate-fade-in absolute inset-0 z-10 bg-black/30 lg:hidden" onClick={closeMenu} aria-hidden />
            <aside className="animate-slide-in-left absolute inset-y-0 left-0 z-20 w-60 bg-sidebar shadow-lg lg:hidden">
              <Sidebar onNavigate={closeMenu} />
            </aside>
          </>
        )}
        <main className="scroll-thin flex min-w-0 flex-1 flex-col p-4 lg:p-5 print:block print:overflow-visible print:p-0">
          <Outlet />
        </main>
      </div>
    </div>
  );
}
