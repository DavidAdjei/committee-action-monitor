import { createContext, useCallback, useContext, useEffect, useState, ReactNode } from "react";
import { endpoints } from "@/api/endpoints";
import { setDevUserId, getDevUserId } from "@/api/client";
import type { Me } from "@/types";

interface AuthContextValue {
  me: Me | null;
  loading: boolean;
  signIn: (userId: number) => Promise<void>;
  signOut: () => void;
  refresh: () => Promise<void>;
}

const AuthContext = createContext<AuthContextValue | null>(null);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [me, setMe] = useState<Me | null>(null);
  const [loading, setLoading] = useState(true);

  const refresh = useCallback(async () => {
    if (!getDevUserId()) {
      setMe(null);
      setLoading(false);
      return;
    }
    setLoading(true);
    try {
      const result = await endpoints.me();
      setMe(result);
    } catch {
      setDevUserId(null);
      setMe(null);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    refresh();
  }, [refresh]);

  const signIn = useCallback(
    async (userId: number) => {
      setDevUserId(userId);
      await refresh();
    },
    [refresh],
  );

  const signOut = useCallback(() => {
    setDevUserId(null);
    setMe(null);
  }, []);

  return (
    <AuthContext.Provider value={{ me, loading, signIn, signOut, refresh }}>{children}</AuthContext.Provider>
  );
}

export function useAuth(): AuthContextValue {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error("useAuth must be used inside <AuthProvider>");
  return ctx;
}
