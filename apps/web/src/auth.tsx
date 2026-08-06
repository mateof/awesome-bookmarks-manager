import { useQuery, useQueryClient } from "@tanstack/react-query";
import { createContext, useContext, useEffect, useMemo } from "react";
import { Navigate, useLocation } from "react-router-dom";
import { ApiError, api } from "./api.js";
import { ForcePasswordChange } from "./components/ForcePasswordChange.js";

interface AuthState {
  user: {
    id: string;
    email: string;
    nickname: string | null;
    role: "user" | "admin";
    autoSnapshots: boolean;
    mustChangePassword: boolean;
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
        if (e instanceof ApiError && (e.status === 401 || e.status === 423)) {
          return null;
        }
        throw e;
      }
    },
    staleTime: 60_000,
  });

  // Any API call returning 401 (session expired) or 423 (DEK evicted from
  // cache) fires `auth:invalidated`. We tear down the local session here
  // so RequireAuth bounces the user to /login automatically; otherwise the
  // SPA stays on a "logged-in" route with every subsequent call failing.
  useEffect(() => {
    let bouncing = false;
    const onInvalid = () => {
      if (bouncing) return;
      bouncing = true;
      // Best-effort server cookie clear. We ignore failures because the
      // cookie may already be invalid — what matters is the next /me
      // returns null so the user lands on /login.
      void api.logout().catch(() => {});
      qc.setQueryData(["me"], null);
      // Allow a fresh signal after the user logs back in.
      setTimeout(() => {
        bouncing = false;
      }, 1000);
    };
    window.addEventListener("auth:invalidated", onInvalid);
    return () => window.removeEventListener("auth:invalidated", onInvalid);
  }, [qc]);
  const value = useMemo<AuthState>(
    () => ({
      user: me.data
        ? {
            id: me.data.id,
            email: me.data.email,
            nickname: me.data.nickname,
            role: me.data.role,
            autoSnapshots: me.data.autoSnapshots,
            mustChangePassword: me.data.mustChangePassword,
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
  // Admin-provisioned account still on its one-time password: force a change
  // before anything else is reachable.
  if (user.mustChangePassword) return <ForcePasswordChange />;
  return <>{children}</>;
}
