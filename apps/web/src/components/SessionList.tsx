import type { UserSession } from "@awesome-bookmarks/shared";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  Bot,
  Laptop,
  LogOut,
  Monitor,
  Smartphone,
  Tablet,
} from "lucide-react";
import { useState } from "react";
import { useTranslation } from "react-i18next";
import { ApiError, api } from "../api.js";
import { fmtDateTime } from "../lib/date.js";
import { dlg } from "./dialogs.js";

/**
 * Where the account is currently open, and the means to cut any of it off.
 *
 * The session cookie is signed and encrypted, so it already proves identity —
 * what it cannot do is stop being valid. Until now a leaked or forgotten
 * cookie stayed usable until it expired. Revoking a row here makes it refused
 * on the very next request.
 */
function DeviceIcon({ device }: { device: UserSession["device"] }) {
  const cls = "h-5 w-5 shrink-0 text-slate-400";
  if (device === "mobile") return <Smartphone className={cls} />;
  if (device === "tablet") return <Tablet className={cls} />;
  if (device === "bot") return <Bot className={cls} />;
  if (device === "desktop") return <Monitor className={cls} />;
  return <Laptop className={cls} />;
}

export function SessionList() {
  const { t } = useTranslation();
  const qc = useQueryClient();
  const [err, setErr] = useState<string | null>(null);

  const q = useQuery({ queryKey: ["sessions"], queryFn: api.listSessions });

  const revoke = useMutation({
    mutationFn: (id: string) => api.revokeSession(id),
    onSuccess: () => {
      setErr(null);
      qc.invalidateQueries({ queryKey: ["sessions"] });
    },
    onError: (e) => setErr(e instanceof ApiError ? e.message : t("common.error")),
  });

  const revokeOthers = useMutation({
    mutationFn: () => api.revokeOtherSessions(),
    onSuccess: () => {
      setErr(null);
      qc.invalidateQueries({ queryKey: ["sessions"] });
    },
    onError: (e) => setErr(e instanceof ApiError ? e.message : t("common.error")),
  });

  const sessions = q.data ?? [];
  const others = sessions.filter((s) => !s.current).length;

  return (
    <div className="space-y-3">
      {err && (
        <div className="rounded-lg bg-red-50 p-2 text-sm text-red-700 dark:bg-red-950 dark:text-red-300">
          {err}
        </div>
      )}

      {q.isLoading && <p className="text-sm text-slate-400">{t("common.loading")}</p>}

      <ul className="space-y-2">
        {sessions.map((s) => (
          <li
            key={s.id}
            className={`flex items-start gap-3 rounded-lg border p-3 ${
              s.current
                ? "border-emerald-300 bg-emerald-50/50 dark:border-emerald-800 dark:bg-emerald-950/20"
                : "border-slate-200 dark:border-slate-800"
            }`}
          >
            <DeviceIcon device={s.device} />
            <div className="min-w-0 flex-1">
              <div className="flex flex-wrap items-center gap-2">
                <span className="text-sm font-medium">
                  {s.browser} · {s.os}
                </span>
                {s.current && (
                  <span className="rounded-full bg-emerald-600 px-2 py-0.5 text-[10px] font-medium uppercase text-white">
                    {t("sessions.thisDevice")}
                  </span>
                )}
              </div>
              <div className="mt-0.5 text-xs text-slate-500">
                {t("sessions.ip")}: <span className="tabular-nums">{s.ip || "?"}</span>
              </div>
              <div className="text-xs text-slate-500">
                {t("sessions.lastSeen", { when: fmtDateTime(s.lastSeenAt) })}
              </div>
              <div className="text-xs text-slate-400">
                {t("sessions.startedAt", { when: fmtDateTime(s.createdAt) })}
              </div>
              {/* The parser is best-effort, so the raw string stays reachable
                  for the cases it reads wrong. */}
              <details className="mt-1">
                <summary className="cursor-pointer text-[11px] text-slate-400 hover:text-slate-600 dark:hover:text-slate-300">
                  {t("sessions.rawAgent")}
                </summary>
                <code className="mt-1 block break-all text-[11px] text-slate-500">
                  {s.userAgent || "—"}
                </code>
              </details>
            </div>
            <button
              type="button"
              disabled={revoke.isPending}
              onClick={async () => {
                const ok = await dlg.confirm({
                  message: s.current
                    ? t("sessions.confirmRevokeCurrent")
                    : t("sessions.confirmRevoke", { browser: s.browser, ip: s.ip }),
                  danger: true,
                  confirmLabel: t("sessions.revoke"),
                });
                if (!ok) return;
                revoke.mutate(s.id);
              }}
              className="shrink-0 rounded-lg border border-red-300 px-2.5 py-1 text-xs text-red-600 transition hover:bg-red-50 disabled:opacity-50 dark:border-red-900/60 dark:hover:bg-red-950"
            >
              {s.current ? t("sessions.logOut") : t("sessions.revoke")}
            </button>
          </li>
        ))}
      </ul>

      {others > 0 && (
        <button
          type="button"
          disabled={revokeOthers.isPending}
          onClick={async () => {
            const ok = await dlg.confirm({
              message: t("sessions.confirmRevokeOthers", { count: others }),
              danger: true,
              confirmLabel: t("sessions.revokeOthers"),
            });
            if (!ok) return;
            revokeOthers.mutate();
          }}
          className="inline-flex items-center gap-1.5 rounded-lg border border-slate-300 px-3 py-2 text-sm transition hover:bg-slate-100 disabled:opacity-50 dark:border-slate-700 dark:hover:bg-slate-800"
        >
          <LogOut className="h-4 w-4" /> {t("sessions.revokeOthers")}
        </button>
      )}

      <p className="text-xs text-slate-500">{t("sessions.explainer")}</p>
    </div>
  );
}
