import { useQuery, useQueryClient } from "@tanstack/react-query";
import { createContext, useContext, useMemo } from "react";
import { Navigate, useLocation } from "react-router-dom";
import { ApiError, api } from "./api.js";

interface AuthState {
  user: {
    id: string;
    email: string;
    nickname: string | null;
    role: "user" | "admin";
    autoSnapshots: boolean;
  } | null;
  loading: boolean;
  refresh: () => void;
}

const Ctx = createContext<AuthState>({
  user: null,
  loading: true,
  refresh: () => {},
});

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const qc = useQueryClient();
  const me = useQuery({
    queryKey: ["me"],
    queryFn: async () => {
      try {
        return await api.me();
      } catch (e) {
        if (e instanceof ApiError && e.status === 401) return null;
        throw e;
      }
    },
    staleTime: 60_000,
  });
  const value = useMemo<AuthState>(
    () => ({
      user: me.data
        ? {
            id: me.data.id,
            email: me.data.email,
            nickname: me.data.nickname,
            role: me.data.role,
            autoSnapshots: me.data.autoSnapshots,
          }
        : null,
      loading: me.isLoading,
      refresh: () => qc.invalidateQueries({ queryKey: ["me"] }),
    }),
    [me.data, me.isLoading, qc],
  );
  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}

export function useAuth() {
  return useContext(Ctx);
}

export function RequireAuth({ children }: { children: React.ReactNode }) {
  const { user, loading } = useAuth();
  const loc = useLocation();
  if (loading) return <div className="p-8 text-slate-400">Cargando…</div>;
  if (!user) {
    return <Navigate to="/login" replace state={{ from: loc.pathname }} />;
  }
  return <>{children}</>;
}
