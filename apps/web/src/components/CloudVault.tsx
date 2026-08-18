import type { CloudBackup, CloudConnection } from "@awesome-bookmarks/shared";
import { formatBytes } from "@awesome-bookmarks/shared";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { ArrowDownToLine, Copy, Star } from "lucide-react";
import { useState } from "react";
import { useTranslation } from "react-i18next";
import { ApiError, api } from "../api.js";
import { fmtDateTime } from "../lib/date.js";
import { dlg } from "./dialogs.js";

/**
 * Backups sitting in one cloud vault, and what can be done with them.
 *
 * Until now the app could only push: the providers implemented `download` and
 * `list`, but nothing called them, so an archive could be uploaded and never
 * retrieved. This is the other direction.
 */
export function CloudVault({
  connection,
  all,
}: {
  connection: CloudConnection;
  all: CloudConnection[];
}) {
  const { t, i18n } = useTranslation();
  const qc = useQueryClient();
  const [open, setOpen] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);
  const [err, setErr] = useState<string | null>(null);

  const backups = useQuery({
    queryKey: ["cloud", "backups", connection.id],
    queryFn: () => api.listBackups(connection.id),
    enabled: open,
  });

  const fail = (e: unknown) =>
    setErr(e instanceof ApiError ? e.message : t("common.error"));

  const restore = useMutation({
    mutationFn: (filename: string) => api.restoreBackup(connection.id, filename),
    onSuccess: () => {
      setErr(null);
      setMsg(t("cloudVault.restoreQueued"));
    },
    onError: fail,
  });

  const copyTo = useMutation({
    mutationFn: (args: { filename: string; targetConnectionId: string }) =>
      api.copyBackup(connection.id, args.filename, args.targetConnectionId),
    onSuccess: () => {
      setErr(null);
      setMsg(t("cloudVault.copied"));
      qc.invalidateQueries({ queryKey: ["cloud", "backups"] });
    },
    onError: fail,
  });

  const makeDefault = useMutation({
    mutationFn: () => api.setDefaultConnection(connection.id),
    onSuccess: () => {
      setErr(null);
      qc.invalidateQueries({ queryKey: ["cloud", "connections"] });
    },
    onError: fail,
  });

  const others = all.filter((c) => c.id !== connection.id);

  return (
    <div className="mt-2 space-y-2 border-t border-slate-200 pt-2 dark:border-slate-800">
      <div className="flex flex-wrap items-center gap-2">
        <button
          type="button"
          onClick={() => setOpen((v) => !v)}
          className="rounded-lg border border-slate-300 px-2.5 py-1 text-xs hover:bg-slate-100 dark:border-slate-700 dark:hover:bg-slate-800"
        >
          {open ? t("cloudVault.hide") : t("cloudVault.show")}
        </button>
        {connection.isDefault ? (
          <span className="inline-flex items-center gap-1 rounded-full bg-amber-100 px-2 py-0.5 text-[11px] font-medium text-amber-800 dark:bg-amber-950 dark:text-amber-300">
            <Star className="h-3 w-3 fill-current" /> {t("cloudVault.isDefault")}
          </span>
        ) : (
          <button
            type="button"
            onClick={() => makeDefault.mutate()}
            disabled={makeDefault.isPending}
            className="inline-flex items-center gap-1 text-[11px] text-slate-500 hover:text-amber-600 disabled:opacity-50"
          >
            <Star className="h-3 w-3" /> {t("cloudVault.makeDefault")}
          </button>
        )}
      </div>

      {msg && (
        <div className="rounded-lg bg-green-50 p-2 text-xs text-green-800 dark:bg-green-950 dark:text-green-300">
          {msg}
        </div>
      )}
      {err && (
        <div className="rounded-lg bg-red-50 p-2 text-xs text-red-700 dark:bg-red-950 dark:text-red-300">
          {err}
        </div>
      )}

      {open && (
        <>
          {backups.isLoading && (
            <p className="text-xs text-slate-400">{t("common.loading")}</p>
          )}
          {backups.isError && (
            <p className="text-xs text-red-600">{t("cloudVault.listFailed")}</p>
          )}
          {backups.data?.length === 0 && (
            <p className="text-xs text-slate-400">{t("cloudVault.empty")}</p>
          )}
          <ul className="space-y-1">
            {(backups.data ?? []).map((b: CloudBackup) => (
              <li
                key={b.path}
                className="flex flex-wrap items-center gap-2 rounded-lg border border-slate-200 p-2 text-xs dark:border-slate-800"
              >
                <div className="min-w-0 flex-1">
                  <div className="truncate font-medium">{b.name}</div>
                  <div className="text-slate-500">
                    {fmtDateTime(b.modifiedAt)} ·{" "}
                    {formatBytes(b.size, i18n.language)}
                  </div>
                </div>
                <button
                  type="button"
                  disabled={restore.isPending}
                  onClick={async () => {
                    const ok = await dlg.confirm({
                      message: t("cloudVault.confirmRestore", { name: b.name }),
                      details: t("cloudVault.restoreDetails"),
                      confirmLabel: t("cloudVault.restore"),
                    });
                    if (ok) restore.mutate(b.name);
                  }}
                  className="inline-flex items-center gap-1 rounded-lg border border-slate-300 px-2 py-1 hover:bg-slate-100 disabled:opacity-50 dark:border-slate-700 dark:hover:bg-slate-800"
                >
                  <ArrowDownToLine className="h-3.5 w-3.5" />
                  {t("cloudVault.restore")}
                </button>
                {others.length > 0 && (
                  <select
                    aria-label={t("cloudVault.copyTo")}
                    value=""
                    disabled={copyTo.isPending}
                    onChange={(e) => {
                      const target = e.target.value;
                      e.target.value = "";
                      if (target) {
                        copyTo.mutate({
                          filename: b.name,
                          targetConnectionId: target,
                        });
                      }
                    }}
                    className="rounded-lg border border-slate-300 px-2 py-1 text-xs dark:border-slate-700 dark:bg-slate-800"
                  >
                    <option value="">{t("cloudVault.copyTo")}</option>
                    {others.map((c) => (
                      <option key={c.id} value={c.id}>
                        {c.label}
                      </option>
                    ))}
                  </select>
                )}
                {others.length === 0 && (
                  <span
                    className="inline-flex items-center gap-1 text-[11px] text-slate-400"
                    title={t("cloudVault.needTwo")}
                  >
                    <Copy className="h-3 w-3" /> {t("cloudVault.copyTo")}
                  </span>
                )}
              </li>
            ))}
          </ul>
        </>
      )}
    </div>
  );
}
