import { useState } from "react";
import { useTranslation } from "react-i18next";
import { Link, Navigate, useNavigate } from "react-router-dom";
import { ApiError, api } from "../api.js";
import { useAuth } from "../auth.js";

export function LoginPage() {
  const { t } = useTranslation();
  const { user, refresh } = useAuth();
  const nav = useNavigate();
  const [identifier, setIdentifier] = useState("");
  const [password, setPassword] = useState("");
  const [err, setErr] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  if (user) return <Navigate to="/" replace />;

  return (
    <div className="flex h-full items-center justify-center bg-slate-50 dark:bg-slate-950">
      <form
        className="w-80 space-y-3 rounded-lg border border-slate-200 bg-white p-6 dark:border-slate-800 dark:bg-slate-900"
        onSubmit={async (e) => {
          e.preventDefault();
          setBusy(true);
          setErr(null);
          try {
            await api.login(identifier, password);
            refresh();
            nav("/", { replace: true });
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
        {err && <div className="text-sm text-red-600">{err}</div>}
        <button
          type="submit"
          disabled={busy}
          className="w-full rounded bg-slate-900 py-2 text-white disabled:opacity-50 dark:bg-slate-100 dark:text-slate-900"
        >
          {busy ? t("auth.loginAction") : t("auth.login")}
        </button>
        <div className="text-center text-sm">
          <Link
            to="/signup"
            className="text-slate-500 hover:text-slate-900 dark:hover:text-slate-100"
          >
            {t("auth.noAccount")}
          </Link>
        </div>
      </form>
    </div>
  );
}
