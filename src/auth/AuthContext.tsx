import * as React from "react";

export type AuthUser = {
  email: string;
  displayName: string;
  role: "Администратор" | "Оператор";
};

type AuthContextValue = {
  user: AuthUser | null;
  ready: boolean;
  login: (email: string, password: string) => Promise<void>;
  logout: () => void;
};

const STORAGE_KEY = "ffmsk_auth_session";

const AuthContext = React.createContext<AuthContextValue | null>(null);

function readStoredUser(): AuthUser | null {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return null;
    return JSON.parse(raw) as AuthUser;
  } catch {
    return null;
  }
}

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [user, setUser] = React.useState<AuthUser | null>(null);
  const [ready, setReady] = React.useState(false);

  React.useEffect(() => {
    setUser(readStoredUser());
    setReady(true);
  }, []);

  const login = React.useCallback(async (email: string, password: string) => {
    await new Promise((r) => setTimeout(r, 450));
    const trimmed = email.trim().toLowerCase();
    if (!trimmed || password.length < 4) {
      throw new Error("Проверьте email и пароль (мин. 4 символа).");
    }
    const next: AuthUser = {
      email: trimmed,
      displayName: trimmed.includes("@") ? trimmed.split("@")[0]! : "Оператор",
      role: trimmed.includes("admin") ? "Администратор" : "Оператор",
    };
    localStorage.setItem(STORAGE_KEY, JSON.stringify(next));
    setUser(next);
  }, []);

  const logout = React.useCallback(() => {
    localStorage.removeItem(STORAGE_KEY);
    setUser(null);
  }, []);

  const value = React.useMemo(
    () => ({ user, ready, login, logout }),
    [user, ready, login, logout],
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth() {
  const ctx = React.useContext(AuthContext);
  if (!ctx) {
    throw new Error("useAuth вне AuthProvider");
  }
  return ctx;
}
