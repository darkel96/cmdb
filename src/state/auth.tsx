import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from "react";
import { api, BROWSER_TEST_MODE } from "@/lib/api";
import type { SessionUser } from "@/lib/types";

interface AuthState {
  /** undefined = wird noch geprüft */
  user: SessionUser | null | undefined;
  testMode: boolean;
  login(username: string, password: string): Promise<void>;
  logout(): Promise<void>;
}

const AuthContext = createContext<AuthState | null>(null);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<SessionUser | null | undefined>(undefined);
  const [testMode, setTestMode] = useState(BROWSER_TEST_MODE);

  useEffect(() => {
    let active = true;
    api.me().then(
      (me) => {
        if (!active) return;
        setUser(me?.user ?? null);
        if (me) setTestMode(me.testMode);
      },
      () => active && setUser(null),
    );
    // Testmodus auch vor der Anmeldung anzeigen
    api.health().then((h) => active && setTestMode(h.testMode), () => undefined);
    return () => {
      active = false;
    };
  }, []);

  const login = useCallback(async (username: string, password: string) => {
    const me = await api.login(username, password);
    setUser(me.user);
    setTestMode(me.testMode);
  }, []);

  const logout = useCallback(async () => {
    await api.logout().catch(() => undefined);
    setUser(null);
  }, []);

  const value = useMemo(() => ({ user, testMode, login, logout }), [user, testMode, login, logout]);
  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth(): AuthState {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error("useAuth ausserhalb von AuthProvider");
  return ctx;
}
