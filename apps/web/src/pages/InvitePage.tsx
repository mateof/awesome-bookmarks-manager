import { useMutation } from "@tanstack/react-query";
import { useState } from "react";
import { Trans, useTranslation } from "react-i18next";
import { Navigate, useNavigate, useParams } from "react-router-dom";
import { ApiError, api } from "../api.js";
import { useAuth } from "../auth.js";

export function InvitePage() {
  const { t } = useTranslation();
  const { token } = useParams<{ token: string }>();
  const { user, loading } = useAuth();
  const nav = useNavigate();
  const [err, setErr] = useState<string | null>(null);

  const m = useMutation({
    mutationFn: () => api.acceptInvitation(token!),
    onSuccess: ({ groupId }) => nav(`/groups/${groupId}`, { replace: true }),
    onError: (e) => setErr(e instanceof ApiError ? e.message : t("common.error")),
  });

  if (loading) return <div className="p-6 text-slate-400">{t("common.loading")}</div>;
  if (!user) {
    return (
      <Navigate
        to={`/login?next=${encodeURIComponent(`/invite/${token}`)}`}
        replace
      />
    );
  }

  return (
    <div className="flex h-full items-center justify-center">
      <div className="space-y-3 rounded border border-slate-200 bg-white p-6 dark:border-slate-800 dark:bg-slate-900">
        <h1 className="font-semibold">{t("invite.title")}</h1>
        <p className="text-sm text-slate-500">
          <Trans
            i18nKey="invite.asUser"
            values={{ email: user.email }}
            components={{ b: <b /> }}
          />
        </p>
        {err && <div className="text-sm text-red-600">{err}</div>}
        <button
          onClick={() => m.mutate()}
          disabled={m.isPending}
          className="w-full rounded bg-slate-900 py-2 text-white disabled:opacity-50 dark:bg-slate-100 dark:text-slate-900"
        >
          {m.isPending ? t("invite.accepting") : t("invite.acceptButton")}
        </button>
      </div>
    </div>
  );
}
