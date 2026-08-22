import {
  type QueryClient,
  useQuery,
  useQueryClient,
} from "@tanstack/react-query";
import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
} from "react";
import { useTranslation } from "react-i18next";
import { Navigate, useLocation, useNavigate } from "react-router-dom";
import { ApiError, api } from "./api.js";
import { Force2FASetup } from "./components/Force2FASetup.js";
import { ForcePasswordChange } from "./components/ForcePasswordChange.js";
import { BootScreen } from "./components/SessionBoot.js";

/**
 * Throw away everything the query cache holds for the session that is ending.
 *
 * Not a nicety. The cache is keyed by query, not by account, so logging out and
 * back in as somebody else left `["folders"]`, `["bookmarks"]` and the rest
 * holding the previous user's **decrypted** names, and React Query hands cached
 * data straight to the first render while it refetches. The result was the
 * previous user's folders on screen for as long as the round trip took.
 *
 * Everything goes, rather than a list of user-scoped keys. Such a list only has
 * to be wrong once, and it would be wrong the first time somebody adds a query
 * without thinking about this file. The cost of over-clearing is refetching two
 * public config queries; the cost of under-clearing is showing one account's
 * content to another.
 */
export function resetSessionCache(qc: QueryClient, keepIdentity = false): void {
  qc.removeQueries({
    predicate: (q) => !(keepIdentity && q.queryKey[0] === "me"),
  });
}

interface AuthState {
  user: {
    id: string;
    email: string;
    nickname: string | null;
    role: "user" | "admin";
    autoSnapshots: boolean;
    autoAcceptInvitations: boolean;
    mustChangePassword: boolean;
    twoFactorEnabled: boolean;
    mustSetup2fa: boolean;
  } | null;
  loading: boolean;
  refresh: () => void;
  /** Adopt a session that was just created. Drops the previous one's data. */
  signIn: () => void;
  /** End the session here and on the server, then land on the login form. */
  signOut: () => Promise<void>;
}

const Ctx = createContext<AuthState>({
  user: null,
  loading: true,
  refresh: () => {},
  signIn: () => {},
  signOut: async () => {},
});

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const qc = useQueryClient();
  const nav = useNavigate();
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
      // Nothing is dropped here on purpose. This fires on *any* 401, and a
      // visitor with no session at all gets one from `/me` on every public
      // panel — clearing the cache there would cancel the panel request that
      // is still in flight and leave the page loading forever. Writing `me` to
      // null is enough: if there really was a session, the identity below
      // changes and that is what drops its data.
      qc.setQueryData(["me"], null);
      // Allow a fresh signal after the user logs back in.
      setTimeout(() => {
        bouncing = false;
      }, 1000);
    };
    window.addEventListener("auth:invalidated", onInvalid);
    return () => window.removeEventListener("auth:invalidated", onInvalid);
  }, [qc]);

  // Backstop. `signIn` and `signOut` below already clear the cache at the two
  // moments a session changes, which is what makes the switch flash-free. This
  // catches a third way in that neither of them saw: a route that logs somebody
  // in without going through them, a session swapped in another tab, a flow
  // added later. It fires a beat late, so it is insurance rather than the fix,
  // and the alternative to insurance here is showing one account another's
  // folders.
  const lastIdentity = useRef<string | null>(null);
  const identity = me.data?.id ?? null;
  useEffect(() => {
    const previous = lastIdentity.current;
    if (identity === previous) return;
    lastIdentity.current = identity;
    // First identity this tab has seen: there is nobody else's data to drop.
    if (previous === null) return;
    resetSessionCache(qc, true);
  }, [identity, qc]);

  const signIn = useCallback(() => {
    // Order matters: drop the old session's answers *before* asking who we are
    // now, so nothing can render from the cache in between.
    resetSessionCache(qc);
    void qc.invalidateQueries({ queryKey: ["me"] });
  }, [qc]);

  const signOut = useCallback(async () => {
    // The server call first: if the cookie survives, clearing here would only
    // hide a session that is still live.
    await api.logout().catch(() => {});
    resetSessionCache(qc);
    nav("/login");
  }, [qc, nav]);

  const value = useMemo<AuthState>(
    () => ({
      user: me.data
        ? {
            id: me.data.id,
            email: me.data.email,
            nickname: me.data.nickname,
            role: me.data.role,
            autoSnapshots: me.data.autoSnapshots,
            autoAcceptInvitations: me.data.autoAcceptInvitations,
            mustChangePassword: me.data.mustChangePassword,
            twoFactorEnabled: me.data.twoFactorEnabled,
            mustSetup2fa: me.data.mustSetup2fa,
          }
        : null,
      loading: me.isLoading,
      refresh: () => qc.invalidateQueries({ queryKey: ["me"] }),
      signIn,
      signOut,
    }),
    [me.data, me.isLoading, qc, signIn, signOut],
  );
  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}

export function useAuth() {
  return useContext(Ctx);
}

export function RequireAuth({ children }: { children: React.ReactNode }) {
  const { user, loading } = useAuth();
  const { t } = useTranslation();
  const loc = useLocation();
  // Step zero of the same bar `SessionBoot` finishes, so the progress the user
  // sees is one continuous run from the login button rather than two screens.
  if (loading) return <BootScreen done={0} label={t("boot.session")} />;
  if (!user) {
    // Keep the query string: a shared link arrives as /share-target?url=…
    // and would otherwise be lost on the way through the login form.
    return (
      <Navigate
        to="/login"
        replace
        state={{ from: `${loc.pathname}${loc.search}` }}
      />
    );
  }
  // Admin-provisioned account still on its one-time password: force a change
  // before anything else is reachable.
  if (user.mustChangePassword) return <ForcePasswordChange />;
  // Admin made 2FA mandatory and this account hasn't enrolled yet.
  if (user.mustSetup2fa) return <Force2FASetup />;
  return <>{children}</>;
}
