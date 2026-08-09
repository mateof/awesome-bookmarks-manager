import { useQueryClient } from "@tanstack/react-query";
import { UserPlus, X } from "lucide-react";
import { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import { useNavigate } from "react-router-dom";
import { api } from "../api.js";
import { useAuth } from "../auth.js";

interface Notif {
  type: "invitation" | "joined";
  groupId: string;
  groupName: string;
  invitedByEmail?: string;
}
interface Toast extends Notif {
  key: number;
}

/**
 * Subscribes to the SSE notification stream while authenticated and shows a
 * toast for group invitations / auto-joins, refreshing the relevant queries so
 * the pending list and shared section update live.
 */
export function Notifications() {
  const { user } = useAuth();
  const qc = useQueryClient();
  const { t } = useTranslation();
  const nav = useNavigate();
  const [toasts, setToasts] = useState<Toast[]>([]);

  useEffect(() => {
    if (!user) return;
    const es = new EventSource(api.notificationsUrl(), {
      withCredentials: true,
    });
    let counter = 0;
    es.onmessage = (e) => {
      let n: Notif;
      try {
        n = JSON.parse(e.data);
      } catch {
        return;
      }
      qc.invalidateQueries({ queryKey: ["invitations"] });
      qc.invalidateQueries({ queryKey: ["groups"] });
      qc.invalidateQueries({ queryKey: ["shared"] });
      const key = ++counter;
      setToasts((ts) => [...ts, { ...n, key }]);
      window.setTimeout(
        () => setToasts((ts) => ts.filter((x) => x.key !== key)),
        10_000,
      );
    };
    return () => es.close();
  }, [user, qc]);

  const dismiss = (key: number) =>
    setToasts((ts) => ts.filter((x) => x.key !== key));

  const act = (toast: Toast) => {
    dismiss(toast.key);
    nav(toast.type === "invitation" ? "/groups" : "/shared");
  };

  if (toasts.length === 0) return null;
  return (
    <div className="fixed bottom-4 right-4 z-50 flex flex-col gap-2">
      {toasts.map((toast) => (
        <div
          key={toast.key}
          className="w-72 rounded-lg border border-slate-200 bg-white p-3 shadow-lg motion-safe:animate-[spotPop_.14s_ease-out] dark:border-slate-700 dark:bg-slate-900"
        >
          <div className="flex items-start gap-2">
            <UserPlus className="mt-0.5 h-4 w-4 shrink-0 text-blue-500" />
            <div className="min-w-0 flex-1 text-sm">
              {toast.type === "invitation"
                ? t("notifications.invited", { group: toast.groupName })
                : t("notifications.joined", { group: toast.groupName })}
            </div>
            <button
              type="button"
              onClick={() => dismiss(toast.key)}
              className="text-slate-400 hover:text-slate-600"
            >
              <X className="h-4 w-4" />
            </button>
          </div>
          <button
            type="button"
            onClick={() => act(toast)}
            className="mt-2 w-full rounded bg-slate-900 py-1 text-xs text-white dark:bg-slate-100 dark:text-slate-900"
          >
            {toast.type === "invitation"
              ? t("notifications.viewInvites")
              : t("notifications.openShared")}
          </button>
        </div>
      ))}
    </div>
  );
}
