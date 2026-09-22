"use client";

/** Contexto de autenticação — DM Conecta (espelha AuthProvider do Flutter). */
import { createContext, useCallback, useContext, useEffect, useState, type ReactNode } from "react";
import { api, getStoredUser } from "./api";
import type { User, UserRole, ProfileType } from "./types";

type AuthStatus = "unknown" | "authenticated" | "unauthenticated";

interface AuthContextValue {
  user: User | null;
  status: AuthStatus;
  login: (email: string, password: string) => Promise<void>;
  register: (input: { name: string; email: string; password: string; role: UserRole; profileType: ProfileType }) => Promise<void>;
  logout: () => void;
  refresh: () => Promise<void>;
}

const AuthContext = createContext<AuthContextValue | null>(null);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [status, setStatus] = useState<AuthStatus>("unknown");

  const checkAuth = useCallback(async () => {
    const stored = getStoredUser();
    if (!stored) {
      setStatus("unauthenticated");
      return;
    }
    setUser(stored);
    const verified = await api.verify();
    if (verified) {
      setUser(verified);
      setStatus("authenticated");
    } else {
      api.logout();
      setUser(null);
      setStatus("unauthenticated");
    }
  }, []);

  useEffect(() => {
    void checkAuth();
  }, [checkAuth]);

  const login = useCallback(async (email: string, password: string) => {
    const u = await api.login(email, password);
    setUser(u);
    setStatus("authenticated");
  }, []);

  const register = useCallback(async (input: { name: string; email: string; password: string; role: UserRole; profileType: ProfileType }) => {
    const u = await api.register(input);
    setUser(u);
    setStatus("authenticated");
  }, []);

  const logout = useCallback(() => {
    api.logout();
    setUser(null);
    setStatus("unauthenticated");
  }, []);

  const refresh = useCallback(async () => {
    await checkAuth();
  }, [checkAuth]);

  return (
    <AuthContext.Provider value={{ user, status, login, register, logout, refresh }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth(): AuthContextValue {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error("useAuth deve ser usado dentro de <AuthProvider>");
  return ctx;
}
