import { useQuery } from "@tanstack/react-query";
import { Fingerprint } from "lucide-react";
import { useState } from "react";
import { useTranslation } from "react-i18next";
import { Link, Navigate, useLocation, useNavigate } from "react-router-dom";
import { ApiError, api } from "../api.js";
import { useAuth } from "../auth.js";
import { loginWithPasskey, passkeysSupported } from "../webauthn.js";

export function LoginPage() {
  const { t } = useTranslation();
  const { user, signIn } = useAuth();
  const nav = useNavigate();
  const loc = useLocation();
  // RequireAuth parks the route the user actually wanted here. It matters most
  // for the share target: arriving from another app's "share" sheet with a
  // logged-out session, the shared URL must survive the login round-trip.
  const from = (loc.state as { from?: string } | null)?.from;
  const target = from && from.startsWith("/") && !from.startsWith("//") ? from : "/";
  const [identifier, setIdentifier] = useState("");
  const [password, setPassword] = useState("");
  const [totp, setTotp] = useState("");
  const [needTotp, setNeedTotp] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const config = useQuery({ queryKey: ["auth-config"], queryFn: api.authConfig });
  const waConfig = useQuery({
    queryKey: ["webauthn-config"],
    queryFn: api.webauthnConfig,
  });
  const showPasskey = waConfig.data?.enabled === true && passkeysSupported();

  const doPasskey = async () => {
    setBusy(true);
    setErr(null);
    try {
      await loginWithPasskey();
      signIn();
      nav(target, { replace: true });
    } catch (e) {
      setErr(
        e instanceof ApiError
          ? e.message
          : e instanceof Error && e.message === "PRF_UNSUPPORTED"
            ? t("twofa.prfUnsupported")
            : t("twofa.passkeyFailed"),
      );
    } finally {
      setBusy(false);
    }
  };

  if (user) return <Navigate to={target} replace />;

  return (
    <div className="flex h-full items-center justify-center bg-slate-50 dark:bg-slate-950">
      <form
        className="w-80 space-y-3 rounded-lg border border-slate-200 bg-white p-6 dark:border-slate-800 dark:bg-slate-900"
        onSubmit={async (e) => {
          e.preventDefault();
          setBusy(true);
          setErr(null);
          try {
            const res = await api.login(
              identifier,
              password,
              needTotp ? totp.trim() : undefined,
            );
            if ("twoFactorRequired" in res) {
              // Account has 2FA: reveal the code field and wait for it.
              setNeedTotp(true);
              setBusy(false);
              return;
            }
            signIn();
            nav(target, { replace: true });
          } catch (e) {
            setErr(e instanceof ApiError ? e.message : t("common.error"));
          } finally {
            setBusy(false);
          }
        }}
      >
        <h1 className="text-lg font-semibold">{t("auth.loginTitle")}</h1>
        <input
          type="text"
          required
          autoFocus
          autoComplete="username"
          value={identifier}
          onChange={(e) => setIdentifier(e.target.value)}
          placeholder={t("auth.emailOrNickname")}
          className="w-full rounded border border-slate-300 bg-white px-3 py-2 dark:border-slate-700 dark:bg-slate-800"
        />
        <input
          type="password"
          required
          autoComplete="current-password"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          placeholder={t("auth.password")}
          className="w-full rounded border border-slate-300 bg-white px-3 py-2 dark:border-slate-700 dark:bg-slate-800"
        />
        {needTotp && (
          <div className="space-y-1">
            <label className="text-xs text-slate-500 dark:text-slate-400">
              {t("twofa.loginPrompt")}
            </label>
            <input
              type="text"
              inputMode="numeric"
              autoComplete="one-time-code"
              autoFocus
              value={totp}
              onChange={(e) => setTotp(e.target.value)}
              placeholder={t("twofa.codePlaceholder")}
              className="w-full rounded border border-slate-300 bg-white px-3 py-2 dark:border-slate-700 dark:bg-slate-800"
            />
          </div>
        )}
        {err && <div className="text-sm text-red-600">{err}</div>}
        <button
          type="submit"
          disabled={busy}
          className="w-full rounded bg-slate-900 py-2 text-white disabled:opacity-50 dark:bg-slate-100 dark:text-slate-900"
        >
          {busy ? t("auth.loginAction") : t("auth.login")}
        </button>
        {showPasskey && (
          <button
            type="button"
            onClick={doPasskey}
            disabled={busy}
            className="flex w-full items-center justify-center gap-2 rounded border border-slate-300 py-2 text-sm hover:bg-slate-100 disabled:opacity-50 dark:border-slate-700 dark:hover:bg-slate-800"
          >
            <Fingerprint className="h-4 w-4" /> {t("twofa.loginWithPasskey")}
          </button>
        )}
        {config.data?.registrationEnabled !== false && (
          <div className="text-center text-sm">
            <Link
              to="/signup"
              state={{ from }}
              className="text-slate-500 hover:text-slate-900 dark:hover:text-slate-100"
            >
              {t("auth.noAccount")}
            </Link>
          </div>
        )}
      </form>
    </div>
  );
}
