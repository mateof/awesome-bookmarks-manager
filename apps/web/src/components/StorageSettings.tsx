import {
  type AdminStorageRow,
  type StorageBreakdown,
  type StorageUsage,
  formatBytes,
} from "@awesome-bookmarks/shared";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { HardDrive, Info, RefreshCw } from "lucide-react";
import { useState } from "react";
import { useTranslation } from "react-i18next";
import { ApiError, api } from "../api.js";

/**
 * Storage consumption and quotas.
 *
 * Every user sees their own figure; admins additionally get a per-account
 * table and the controls to cap anyone, themselves included. The breakdown is
 * shown rather than a bare total because the answer to "why am I at 4 GB?" is
 * almost always "saved page snapshots", and a single number gives nobody
 * anything to act on.
 */

const BUCKETS: Array<{ key: keyof StorageBreakdown; color: string }> = [
  { key: "snapshots", color: "#6366f1" },
  { key: "images", color: "#0ea5e9" },
  { key: "icons", color: "#10b981" },
  { key: "panelAssets", color: "#f59e0b" },
  { key: "attachments", color: "#ec4899" },
  { key: "database", color: "#94a3b8" },
];

/** Colour by how close to the limit: neutral, then amber, then red. */
function barColor(ratio: number): string {
  if (ratio >= 1) return "bg-red-500";
  if (ratio >= 0.85) return "bg-amber-500";
  return "bg-slate-900 dark:bg-slate-100";
}

function UsageBar({ used, quota }: { used: number; quota: number | null }) {
  if (quota === null || quota <= 0) return null;
  const ratio = used / quota;
  return (
    <div className="h-2 w-full overflow-hidden rounded-full bg-slate-200 dark:bg-slate-700">
      <div
        className={`h-full rounded-full transition-[width] ${barColor(ratio)}`}
        style={{ width: `${Math.min(100, ratio * 100)}%` }}
      />
    </div>
  );
}

function Breakdown({ breakdown }: { breakdown: StorageBreakdown }) {
  const { t, i18n } = useTranslation();
  const total = BUCKETS.reduce((n, b) => n + breakdown[b.key], 0);
  const shown = BUCKETS.filter((b) => breakdown[b.key] > 0);
  if (shown.length === 0) {
    return <p className="text-sm text-slate-400">{t("storage.nothingStored")}</p>;
  }
  return (
    <div className="space-y-2">
      {/* One stacked bar, so the dominant consumer is obvious at a glance. */}
      <div className="flex h-2 w-full overflow-hidden rounded-full bg-slate-200 dark:bg-slate-700">
        {shown.map((b) => (
          <div
            key={b.key}
            style={{
              width: `${(breakdown[b.key] / total) * 100}%`,
              background: b.color,
            }}
          />
        ))}
      </div>
      <ul className="space-y-1">
        {shown.map((b) => (
          <li key={b.key} className="flex items-center gap-2 text-sm">
            <span
              aria-hidden
              className="h-2.5 w-2.5 shrink-0 rounded-full"
              style={{ background: b.color }}
            />
            <span className="flex-1 text-slate-600 dark:text-slate-300">
              {t(`storage.bucket.${b.key}` as "storage.bucket.snapshots")}
            </span>
            <span className="tabular-nums text-slate-500">
              {formatBytes(breakdown[b.key], i18n.language)}
            </span>
          </li>
        ))}
      </ul>
    </div>
  );
}

export function MyStorage() {
  const { t, i18n } = useTranslation();
  const qc = useQueryClient();
  const q = useQuery({ queryKey: ["storage", "me"], queryFn: () => api.myStorage() });

  const recheck = useMutation({
    mutationFn: () => api.myStorage(true),
    onSuccess: (fresh) => qc.setQueryData(["storage", "me"], fresh),
  });

  if (q.isLoading) return <p className="text-sm text-slate-400">{t("common.loading")}</p>;
  const usage: StorageUsage | undefined = q.data;
  if (!usage) return <p className="text-sm text-slate-400">{t("common.error")}</p>;

  const ratio = usage.quotaBytes ? usage.usedBytes / usage.quotaBytes : 0;
  const over = usage.quotaBytes !== null && usage.usedBytes >= usage.quotaBytes;

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-baseline gap-2">
        <span className="text-2xl font-semibold tabular-nums">
          {formatBytes(usage.usedBytes, i18n.language)}
        </span>
        <span className="text-sm text-slate-500">
          {usage.quotaBytes === null
            ? t("storage.noLimit")
            : t("storage.ofQuota", {
                quota: formatBytes(usage.quotaBytes, i18n.language),
                percent: Math.round(ratio * 100),
              })}
        </span>
        <button
          type="button"
          onClick={() => recheck.mutate()}
          disabled={recheck.isPending}
          title={t("storage.recalculate")}
          aria-label={t("storage.recalculate")}
          className="ml-auto rounded-lg border border-slate-300 p-1.5 text-slate-500 hover:bg-slate-100 disabled:opacity-50 dark:border-slate-700 dark:hover:bg-slate-800"
        >
          <RefreshCw
            className={`h-4 w-4 ${recheck.isPending ? "motion-safe:animate-spin" : ""}`}
          />
        </button>
      </div>

      <UsageBar used={usage.usedBytes} quota={usage.quotaBytes} />

      {over && (
        <p className="rounded-lg bg-red-50 p-2 text-sm text-red-700 dark:bg-red-950 dark:text-red-300">
          {t("storage.overQuota")}
        </p>
      )}

      <Breakdown breakdown={usage.breakdown} />

      <p className="flex items-start gap-2 text-xs text-slate-500">
        <Info className="mt-0.5 h-3.5 w-3.5 shrink-0" />
        {t("storage.explainer")}
      </p>
    </div>
  );
}

/** Parse "500 MB", "2g", "1024" into bytes. Empty string = no limit. */
export function parseSize(input: string): number | null | undefined {
  const raw = input.trim().toLowerCase().replace(",", ".");
  if (raw === "") return null;
  const m = /^([0-9]*\.?[0-9]+)\s*(b|k|kb|m|mb|g|gb|t|tb)?$/.exec(raw);
  if (!m) return undefined; // unparseable: the caller should reject it
  const value = Number(m[1]);
  const unit = m[2] ?? "mb"; // a bare number is the unit people mean: MB
  const factor =
    unit.startsWith("t")
      ? 1024 ** 4
      : unit.startsWith("g")
        ? 1024 ** 3
        : unit.startsWith("m")
          ? 1024 ** 2
          : unit.startsWith("k")
            ? 1024
            : 1;
  return Math.round(value * factor);
}

export function AdminStorage() {
  const { t, i18n } = useTranslation();
  const qc = useQueryClient();
  const [err, setErr] = useState<string | null>(null);

  const rows = useQuery({
    queryKey: ["storage", "admin"],
    queryFn: api.adminListStorage,
  });
  const settings = useQuery({
    queryKey: ["admin-settings"],
    queryFn: api.adminGetSettings,
  });

  const setDefault = useMutation({
    mutationFn: (bytes: number | null) =>
      api.adminSetSettings({ defaultStorageQuotaBytes: bytes }),
    onSuccess: () => {
      setErr(null);
      qc.invalidateQueries({ queryKey: ["admin-settings"] });
      qc.invalidateQueries({ queryKey: ["storage"] });
    },
    onError: (e) =>
      setErr(e instanceof ApiError ? e.message : t("common.error")),
  });

  const setQuota = useMutation({
    mutationFn: ({ id, bytes }: { id: string; bytes: number | null }) =>
      api.adminSetUserQuota(id, bytes),
    onSuccess: () => {
      setErr(null);
      qc.invalidateQueries({ queryKey: ["storage"] });
    },
    onError: (e) =>
      setErr(e instanceof ApiError ? e.message : t("common.error")),
  });

  const [defaultInput, setDefaultInput] = useState<string | null>(null);
  const currentDefault = settings.data?.defaultStorageQuotaBytes ?? null;
  const defaultValue =
    defaultInput ??
    (currentDefault === null ? "" : formatBytes(currentDefault, "en").replace(" ", ""));

  return (
    <div className="space-y-4">
      <div className="space-y-2">
        <label className="block text-sm font-medium">
          {t("storage.defaultQuota")}
          <div className="mt-1 flex flex-wrap items-center gap-2">
            <input
              value={defaultValue}
              onChange={(e) => setDefaultInput(e.target.value)}
              placeholder={t("storage.quotaPlaceholder")}
              className="w-40 rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm dark:border-slate-700 dark:bg-slate-800"
            />
            <button
              type="button"
              disabled={setDefault.isPending}
              onClick={() => {
                const bytes = parseSize(defaultValue);
                if (bytes === undefined) {
                  setErr(t("storage.badSize"));
                  return;
                }
                setDefault.mutate(bytes);
                setDefaultInput(null);
              }}
              className="rounded-lg bg-slate-900 px-3 py-2 text-sm text-white disabled:opacity-50 dark:bg-slate-100 dark:text-slate-900"
            >
              {t("common.save")}
            </button>
          </div>
        </label>
        <p className="text-xs text-slate-500">{t("storage.defaultQuotaHint")}</p>
      </div>

      {err && (
        <div className="rounded-lg bg-red-50 p-2 text-sm text-red-700 dark:bg-red-950 dark:text-red-300">
          {err}
        </div>
      )}

      {rows.isLoading && (
        <p className="text-sm text-slate-400">{t("common.loading")}</p>
      )}

      <div className="overflow-x-auto">
        <table className="w-full min-w-[34rem] text-sm">
          <thead>
            <tr className="border-b border-slate-200 text-left text-xs uppercase text-slate-500 dark:border-slate-800">
              <th className="py-2 pr-2 font-medium">{t("storage.colUser")}</th>
              <th className="py-2 pr-2 font-medium">{t("storage.colUsed")}</th>
              <th className="py-2 pr-2 font-medium">{t("storage.colQuota")}</th>
              <th className="py-2 font-medium" />
            </tr>
          </thead>
          <tbody>
            {(rows.data ?? []).map((row) => (
              <QuotaRow
                key={row.userId}
                row={row}
                locale={i18n.language}
                busy={setQuota.isPending}
                onSave={(bytes) => setQuota.mutate({ id: row.userId, bytes })}
                onBadSize={() => setErr(t("storage.badSize"))}
              />
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

function QuotaRow({
  row,
  locale,
  busy,
  onSave,
  onBadSize,
}: {
  row: AdminStorageRow;
  locale: string;
  busy: boolean;
  onSave: (bytes: number | null) => void;
  onBadSize: () => void;
}) {
  const { t } = useTranslation();
  const [draft, setDraft] = useState<string | null>(null);
  // An inherited limit shows blank, so saving an empty box keeps meaning
  // "no override" rather than silently pinning the current default.
  const shown =
    draft ??
    (row.quotaSource === "user" && row.quotaBytes !== null
      ? formatBytes(row.quotaBytes, "en").replace(" ", "")
      : "");
  const over = row.quotaBytes !== null && row.usedBytes >= row.quotaBytes;

  return (
    <tr className="border-b border-slate-100 last:border-0 dark:border-slate-800/60">
      <td className="py-2 pr-2">
        <div className="truncate font-medium">{row.nickname ?? row.email}</div>
        <div className="truncate text-xs text-slate-500">{row.email}</div>
      </td>
      <td className={`py-2 pr-2 tabular-nums ${over ? "text-red-600 dark:text-red-400" : ""}`}>
        {formatBytes(row.usedBytes, locale)}
      </td>
      <td className="py-2 pr-2">
        <input
          value={shown}
          onChange={(e) => setDraft(e.target.value)}
          placeholder={
            row.quotaSource === "default" && row.quotaBytes !== null
              ? t("storage.inherited", {
                  size: formatBytes(row.quotaBytes, locale),
                })
              : t("storage.noLimitShort")
          }
          aria-label={t("storage.quotaFor", { user: row.email })}
          className="w-32 rounded-lg border border-slate-300 bg-white px-2 py-1 text-sm dark:border-slate-700 dark:bg-slate-800"
        />
      </td>
      <td className="py-2 text-right">
        <button
          type="button"
          disabled={busy || draft === null}
          onClick={() => {
            const bytes = parseSize(shown);
            if (bytes === undefined) {
              onBadSize();
              return;
            }
            onSave(bytes);
            setDraft(null);
          }}
          className="rounded-lg border border-slate-300 px-2.5 py-1 text-xs disabled:opacity-40 dark:border-slate-700"
        >
          {t("common.save")}
        </button>
      </td>
    </tr>
  );
}

export function StorageIcon() {
  return <HardDrive className="h-4 w-4" />;
}
