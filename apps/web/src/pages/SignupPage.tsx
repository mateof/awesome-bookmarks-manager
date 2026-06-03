import { useState } from "react";
import { useTranslation } from "react-i18next";
import { Link, Navigate, useNavigate } from "react-router-dom";
import { ApiError, api } from "../api.js";
import { useAuth } from "../auth.js";

export function SignupPage() {
  const { t } = useTranslation();
  const { user, refresh } = useAuth();
  const nav = useNavigate();
  const [email, setEmail] = useState("");
  const [nickname, setNickname] = useState("");
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
            await api.signup(email, nickname, password);
            refresh();
            nav("/", { replace: true });
          } catch (e) {
            setErr(e instanceof ApiError ? e.message : t("common.error"));
          } finally {
            setBusy(false);
          }
        }}
      >
        <h1 className="text-lg font-semibold">{t("auth.signup")}</h1>
        <input
          type="email"
          required
          autoFocus
          autoComplete="email"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          placeholder="Email"
          className="w-full rounded border border-slate-300 bg-white px-3 py-2 dark:border-slate-700 dark:bg-slate-800"
        />
        <input
          type="text"
          required
          autoComplete="username"
          value={nickname}
          onChange={(e) => setNickname(e.target.value)}
          placeholder={t("auth.nicknameHint")}
          minLength={3}
          maxLength={32}
          pattern="[a-zA-Z0-9._\-]+"
          title={t("auth.nicknameTitle")}
          className="w-full rounded border border-slate-300 bg-white px-3 py-2 dark:border-slate-700 dark:bg-slate-800"
        />
        <input
          type="password"
          required
          autoComplete="new-password"
          minLength={10}
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          placeholder={t("auth.passwordMin")}
          className="w-full rounded border border-slate-300 bg-white px-3 py-2 dark:border-slate-700 dark:bg-slate-800"
        />
        <p className="text-xs text-slate-500">{t("auth.signupWarning")}</p>
        {err && <div className="text-sm text-red-600">{err}</div>}
        <button
          type="submit"
          disabled={busy}
          className="w-full rounded bg-slate-900 py-2 text-white disabled:opacity-50 dark:bg-slate-100 dark:text-slate-900"
        >
          {busy ? t("auth.signupAction") : t("auth.signup")}
        </button>
        <div className="text-center text-sm">
          <Link
            to="/login"
            className="text-slate-500 hover:text-slate-900 dark:hover:text-slate-100"
          >
            {t("auth.haveAccount")}
          </Link>
        </div>
      </form>
    </div>
  );
}
