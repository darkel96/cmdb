import { Database, LayoutList, LogOut, Settings } from "lucide-react";
import { NavLink, Navigate, Outlet, useLocation } from "react-router";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { useAuth } from "@/state/auth";
import { TestBanner } from "./TestBanner";

const ROLE_LABEL = { admin: "Admin", user: "Benutzer" } as const;

function NavItem({ to, icon: Icon, children }: { to: string; icon: typeof LayoutList; children: string }) {
  return (
    <NavLink
      to={to}
      end
      className={({ isActive }) =>
        cn("flex items-center gap-2 rounded-md px-3 py-1.5 text-sm font-medium text-muted-foreground transition-colors hover:bg-accent hover:text-foreground", isActive && "bg-accent text-foreground")
      }
    >
      <Icon className="size-4" aria-hidden />
      {children}
    </NavLink>
  );
}

/** App-Rahmen für angemeldete Personen: Kopfzeile mit Navigation, Name, Rolle und Abmelden */
export function AppShell() {
  const { user, testMode, logout } = useAuth();
  const location = useLocation();

  if (user === undefined) return <p className="p-8 text-sm text-muted-foreground">Wird geladen …</p>;
  if (user === null) return <Navigate to="/login" replace state={{ from: location.pathname }} />;

  return (
    <div className="flex min-h-svh flex-col">
      {testMode && <TestBanner />}
      <header className="border-b bg-card">
        <div className="mx-auto flex max-w-6xl flex-wrap items-center gap-x-6 gap-y-2 px-4 py-3">
          <div className="flex items-center gap-2 font-semibold">
            <Database className="size-5" aria-hidden />
            CMDB
          </div>
          <nav aria-label="Hauptnavigation" className="flex items-center gap-1">
            <NavItem to="/" icon={LayoutList}>Übersicht</NavItem>
            {user.role === "admin" && <NavItem to="/verwaltung" icon={Settings}>Verwaltung</NavItem>}
          </nav>
          <div className="ml-auto flex items-center gap-3">
            <div className="text-right leading-tight">
              <div className="text-sm font-medium" data-testid="user-name">{user.displayName}</div>
              <div className="text-xs text-muted-foreground">{user.username}</div>
            </div>
            <Badge variant={user.role === "admin" ? "default" : "secondary"} data-testid="user-role">{ROLE_LABEL[user.role]}</Badge>
            <Button variant="outline" size="sm" onClick={() => void logout()}>
              <LogOut aria-hidden />
              Abmelden
            </Button>
          </div>
        </div>
      </header>
      <main className="mx-auto w-full max-w-6xl flex-1 px-4 py-6">
        <Outlet />
      </main>
    </div>
  );
}

/** Nur für admin; andere Rollen landen auf der Übersicht */
export function AdminOnly({ children }: { children: React.ReactNode }) {
  const { user } = useAuth();
  if (user?.role !== "admin") return <Navigate to="/" replace />;
  return <>{children}</>;
}
