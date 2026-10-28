import { useEffect, useState } from "react";
import { ChevronDown, Database, Home, LogOut, Menu, Settings, User } from "lucide-react";
import { NavLink, Navigate, Outlet, useLocation } from "react-router";
import { Badge } from "@/components/ui/badge";
import { NAV_GROUPS, NAV_LISTS, type NavGroup } from "@/lib/navigation";
import { cn } from "@/lib/utils";
import { useAuth } from "@/state/auth";
import { TestBanner } from "./TestBanner";

const ROLE_LABEL = { admin: "Admin", user: "Benutzer" } as const;

const itemClass = ({ isActive }: { isActive: boolean }) =>
  cn("flex items-center gap-3 rounded-md px-3 py-2 text-sm font-medium text-sidebar-foreground/90 transition-colors hover:bg-sidebar-accent hover:text-sidebar-foreground", isActive && "bg-sidebar-accent text-sidebar-foreground");

function SidebarGroup({ group, onNavigate }: { group: NavGroup; onNavigate: () => void }) {
  const location = useLocation();
  const containsActive = group.items.some((i) => location.pathname === `/bereich/${i.id}`);
  const [open, setOpen] = useState(containsActive);
  useEffect(() => {
    if (containsActive) setOpen(true);
  }, [containsActive]);
  const Icon = group.icon;
  return (
    <li>
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        aria-expanded={open}
        className="flex w-full items-center gap-3 rounded-md px-3 py-2 text-sm font-medium text-sidebar-foreground/90 transition-colors hover:bg-sidebar-accent hover:text-sidebar-foreground"
      >
        <Icon className="size-5 shrink-0" aria-hidden />
        <span className="flex-1 text-left">{group.label}</span>
        <ChevronDown className={cn("size-4 transition-transform", open && "rotate-180")} aria-hidden />
      </button>
      {open && (
        <ul className="mt-0.5 mb-1 ml-8 flex flex-col gap-0.5 border-l border-sidebar-foreground/20 pl-2">
          {group.items.map((item) => (
            <li key={item.id}>
              <NavLink to={`/bereich/${item.id}`} className={itemClass} onClick={onNavigate}>
                {item.label}
              </NavLink>
            </li>
          ))}
        </ul>
      )}
    </li>
  );
}

function Sidebar({ onNavigate }: { onNavigate: () => void }) {
  const ListIcon = NAV_LISTS.icon;
  return (
    <nav aria-label="Hauptnavigation" className="flex h-full flex-col gap-1 overflow-y-auto p-2">
      <ul className="flex flex-col gap-0.5">
        <li>
          <NavLink to="/" end className={itemClass} onClick={onNavigate}>
            <Home className="size-5 shrink-0" aria-hidden />
            Startseite
          </NavLink>
        </li>
        {NAV_GROUPS.map((g) => (
          <SidebarGroup key={g.id} group={g} onNavigate={onNavigate} />
        ))}
        <li>
          <NavLink to={`/bereich/${NAV_LISTS.id}`} className={itemClass} onClick={onNavigate}>
            <ListIcon className="size-5 shrink-0" aria-hidden />
            {NAV_LISTS.label}
          </NavLink>
        </li>
      </ul>
    </nav>
  );
}

const topButton = "inline-flex h-9 items-center gap-2 rounded-md bg-white/15 px-3 text-sm font-medium text-brand-foreground transition-colors hover:bg-white/25 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white/60";

/** App-Rahmen für angemeldete Personen: Kopfleiste mit Name, Rolle und Abmelden, Seitenleiste mit den Bereichen */
export function AppShell() {
  const { user, testMode, logout } = useAuth();
  const location = useLocation();
  // Auf breiten Bildschirmen ist die Seitenleiste offen, auf schmalen wird sie über das Menü eingeblendet
  const [sidebarOpen, setSidebarOpen] = useState(() => typeof window === "undefined" || window.matchMedia("(min-width: 1024px)").matches);
  const isWide = () => window.matchMedia("(min-width: 1024px)").matches;
  const closeOnNarrow = () => {
    if (!isWide()) setSidebarOpen(false);
  };

  if (user === undefined) return <p className="p-8 text-sm text-muted-foreground">Wird geladen …</p>;
  if (user === null) return <Navigate to="/login" replace state={{ from: location.pathname }} />;

  return (
    <div className="flex min-h-svh flex-col">
      {testMode && <TestBanner />}
      <header className="flex h-12 shrink-0 items-center gap-2 bg-brand px-2 text-brand-foreground shadow-sm">
        <button type="button" className={cn(topButton, "px-2.5")} onClick={() => setSidebarOpen((o) => !o)} aria-label="Menü ein- oder ausblenden" aria-expanded={sidebarOpen}>
          <Menu className="size-5" aria-hidden />
        </button>
        <div className="flex items-center gap-2 px-2 text-lg font-semibold">
          <Database className="size-5" aria-hidden />
          CMDB
        </div>
        <div className="ml-auto flex items-center gap-1.5">
          {user.role === "admin" && (
            <NavLink to="/verwaltung" aria-label="Verwaltung" className={({ isActive }) => cn(topButton, isActive && "bg-white/30")}>
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
      <div className="relative flex flex-1">
        {sidebarOpen && (
          <>
            {/* Schmale Bildschirme: Seitenleiste über dem Inhalt, Klick daneben schliesst sie */}
            <div className="fixed inset-0 z-10 bg-black/30 lg:hidden" onClick={() => setSidebarOpen(false)} aria-hidden />
            <aside className="absolute inset-y-0 left-0 z-20 w-60 bg-sidebar shadow-lg lg:static lg:shadow-none">
              <Sidebar onNavigate={closeOnNarrow} />
            </aside>
          </>
        )}
        <main className="min-w-0 flex-1 p-4 lg:p-5">
          <Outlet />
        </main>
      </div>
    </div>
  );
}

/** Nur für admin; andere Rollen landen auf der Startseite */
export function AdminOnly({ children }: { children: React.ReactNode }) {
  const { user } = useAuth();
  if (user?.role !== "admin") return <Navigate to="/" replace />;
  return <>{children}</>;
}
