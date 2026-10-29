import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from "react";
import { api, BROWSER_TEST_MODE } from "@/lib/api";
import { can as hasPermission, type Action, type Permissions } from "@/lib/permissions";
import type { SessionUser } from "@/lib/types";

interface AuthState {
  /** undefined = wird noch geprüft */
  user: SessionUser | null | undefined;
  testMode: boolean;
  permissions: Permissions;
  /** Hat die angemeldete Person das Recht für Bereich und Aktion? */
  can(area: string, action: Action): boolean;
  login(username: string, password: string, remember?: boolean): Promise<void>;
  logout(): Promise<void>;
}

const AuthContext = createContext<AuthState | null>(null);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<SessionUser | null | undefined>(undefined);
  const [testMode, setTestMode] = useState(BROWSER_TEST_MODE);
  const [permissions, setPermissions] = useState<Permissions>({});

  useEffect(() => {
    let active = true;
    api.me().then(
      (me) => {
        if (!active) return;
        setUser(me?.user ?? null);
        if (me) {
          setTestMode(me.testMode);
          setPermissions(me.permissions ?? {});
        }
      },
      () => active && setUser(null),
    );
    // Testmodus auch vor der Anmeldung anzeigen
    api.health().then((h) => active && setTestMode(h.testMode), () => undefined);
    return () => {
      active = false;
    };
  }, []);

  const login = useCallback(async (username: string, password: string, remember = false) => {
    const me = await api.login(username, password, remember);
    setUser(me.user);
    setTestMode(me.testMode);
    setPermissions(me.permissions ?? {});
  }, []);

  const logout = useCallback(async () => {
    await api.logout().catch(() => undefined);
    setUser(null);
    setPermissions({});
  }, []);

  const can = useCallback((area: string, action: Action) => hasPermission(permissions, area, action), [permissions]);
  const value = useMemo(() => ({ user, testMode, permissions, can, login, logout }), [user, testMode, permissions, can, login, logout]);
  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth(): AuthState {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error("useAuth ausserhalb von AuthProvider");
  return ctx;
}
