import { useMutation } from "@tanstack/react-query";
import { useState } from "react";
import { useTranslation } from "react-i18next";
import { ApiError, api } from "../api.js";
import { useAuth } from "../auth.js";

/**
 * Full-screen gate shown when a user must set a new password (admin-created
 * accounts with a one-time password). Blocks the app until done.
 */
export function ForcePasswordChange() {
  const { t } = useTranslation();
  const { refresh } = useAuth();
  const [pw, setPw] = useState("");
  const [confirm, setConfirm] = useState("");
  const [err, setErr] = useState<string | null>(null);

  const m = useMutation({
    mutationFn: () => api.firstPassword(pw),
    onSuccess: () => refresh(),
    onError: (e) =>
      setErr(e instanceof ApiError ? e.message : t("common.error")),
  });

  const mismatch = confirm.length > 0 && pw !== confirm;
  const ready = pw.length >= 10 && pw === confirm && !m.isPending;

  return (
    <div className="flex h-full items-center justify-center bg-slate-50 dark:bg-slate-950">
      <form
        className="w-96 max-w-full space-y-3 rounded-lg border border-slate-200 bg-white p-6 dark:border-slate-800 dark:bg-slate-900"
        onSubmit={(e) => {
          e.preventDefault();
          if (ready) m.mutate();
        }}
      >
        <h1 className="text-lg font-semibold">{t("firstPassword.title")}</h1>
        <p className="text-sm text-slate-500">{t("firstPassword.intro")}</p>
        <input
          type="password"
          required
          autoFocus
          autoComplete="new-password"
          minLength={10}
          value={pw}
          onChange={(e) => setPw(e.target.value)}
          placeholder={t("firstPassword.newPassword")}
          className="w-full rounded border border-slate-300 bg-white px-3 py-2 dark:border-slate-700 dark:bg-slate-800"
        />
        <input
          type="password"
          required
          autoComplete="new-password"
          value={confirm}
          onChange={(e) => setConfirm(e.target.value)}
          placeholder={t("firstPassword.confirm")}
          className="w-full rounded border border-slate-300 bg-white px-3 py-2 dark:border-slate-700 dark:bg-slate-800"
        />
        {mismatch && (
          <div className="text-sm text-red-600">{t("firstPassword.mismatch")}</div>
        )}
        {err && <div className="text-sm text-red-600">{err}</div>}
        <button
          type="submit"
          disabled={!ready}
          className="w-full rounded bg-slate-900 py-2 text-white disabled:opacity-50 dark:bg-slate-100 dark:text-slate-900"
        >
          {m.isPending ? t("common.saving") : t("firstPassword.submit")}
        </button>
      </form>
    </div>
  );
}
