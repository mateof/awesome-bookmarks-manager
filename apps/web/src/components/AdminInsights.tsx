import type {
  InsightsDay,
  InsightsUser,
  StorageBreakdown,
} from "@awesome-bookmarks/shared";
import { formatBytes } from "@awesome-bookmarks/shared";
import { useQuery } from "@tanstack/react-query";
import { useState } from "react";
import { useTranslation } from "react-i18next";
import { api } from "../api.js";
import { fmtDate } from "../lib/date.js";

/**
 * The admin panel: disk by type, per account, plus how the instance is used.
 *
 * It shows counts, bytes and timestamps and nothing else, because that is all
 * there is: an admin holds nobody's key, so no folder name or bookmark title
 * can appear here however much anyone would like it to. The page says so out
 * loud rather than leaving an admin to conclude it is broken.
 *
 * No chart library. Everything drawn here is a proportion of a total, which is
 * a div with a width, and a dependency that ships a rendering engine to do that
 * would cost more than the whole feature.
 */

/** The six kinds of bytes, in the order they are stacked and listed. */
const KINDS = [
  { key: "snapshots", cls: "bg-sky-500" },
  { key: "attachments", cls: "bg-violet-500" },
  { key: "images", cls: "bg-emerald-500" },
  { key: "icons", cls: "bg-amber-500" },
  { key: "panelAssets", cls: "bg-rose-500" },
  { key: "database", cls: "bg-slate-400" },
] as const;

function StackedBar({ b, total }: { b: StorageBreakdown; total: number }) {
  if (total <= 0) {
    return <div className="h-2 w-full rounded-full bg-slate-200 dark:bg-slate-700" />;
  }
  return (
    <div className="flex h-2 w-full overflow-hidden rounded-full bg-slate-200 dark:bg-slate-700">
      {KINDS.map(({ key, cls }) => {
        const value = b[key];
        if (value <= 0) return null;
        return (
          <div
            key={key}
            className={cls}
            style={{ width: `${(value / total) * 100}%` }}
          />
        );
      })}
    </div>
  );
}

function Stat({ label, value, hint }: { label: string; value: string; hint?: string }) {
  return (
    <div className="rounded-lg border border-slate-200 p-3 dark:border-slate-800">
      <div className="text-xs text-slate-500 dark:text-slate-400">{label}</div>
      <div className="text-xl font-semibold tabular-nums">{value}</div>
      {hint && (
        <div className="mt-0.5 text-xs text-slate-500 dark:text-slate-400">
          {hint}
        </div>
      )}
    </div>
  );
}

/** Thirty days of logins, tallest day setting the scale. */
function ActivityStrip({ days }: { days: InsightsDay[] }) {
  const { t } = useTranslation();
  const peak = Math.max(1, ...days.map((d) => d.logins + d.failedLogins));
  return (
    <div>
      <div className="flex h-16 items-end gap-0.5">
        {days.map((d) => (
          <div
            key={d.date}
            className="group relative flex flex-1 flex-col justify-end gap-px"
            title={`${d.date} · ${t("insights.loginsN", { count: d.logins })}${
              d.failedLogins
                ? ` · ${t("insights.failedN", { count: d.failedLogins })}`
                : ""
            }`}
          >
            {d.failedLogins > 0 && (
              <div
                className="w-full rounded-sm bg-rose-400"
                style={{ height: `${(d.failedLogins / peak) * 100}%` }}
              />
            )}
            <div
              className="w-full rounded-sm bg-sky-500"
              style={{ height: `${(d.logins / peak) * 100}%` }}
            />
            {/* An empty day still gets a hairline, so the strip reads as
                thirty days rather than as however many were busy. */}
            {d.logins === 0 && d.failedLogins === 0 && (
              <div className="h-px w-full bg-slate-200 dark:bg-slate-700" />
            )}
          </div>
        ))}
      </div>
      <div className="mt-1 flex justify-between text-xs text-slate-500 dark:text-slate-400">
        <span>{days[0]?.date}</span>
        <span>{days[days.length - 1]?.date}</span>
      </div>
    </div>
  );
}

function UserRow({ u, locale }: { u: InsightsUser; locale: string }) {
  const { t } = useTranslation();
  const [open, setOpen] = useState(false);
  const total = u.usedBytes;
  const pctOfQuota =
    u.quotaBytes && u.quotaBytes > 0
      ? Math.min(100, Math.round((total / u.quotaBytes) * 100))
      : null;

  return (
    <div className="rounded-lg border border-slate-200 dark:border-slate-800">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className="flex w-full flex-wrap items-center gap-x-3 gap-y-1 p-3 text-left hover:bg-slate-50 dark:hover:bg-slate-800/50"
      >
        <span className="min-w-0 flex-1">
          <span className="block truncate text-sm font-medium">
            {u.nickname ?? u.email}
          </span>
          <span className="block truncate text-xs text-slate-500 dark:text-slate-400">
            {u.email}
          </span>
        </span>
        {u.role === "admin" && (
          <span className="rounded-full bg-slate-100 px-2 py-0.5 text-xs dark:bg-slate-800">
            admin
          </span>
        )}
        <span className="text-right text-sm tabular-nums">
          <span className="block font-medium">{formatBytes(total, locale)}</span>
          <span className="block text-xs text-slate-500 dark:text-slate-400">
            {pctOfQuota === null
              ? t("insights.noQuota")
              : t("insights.ofQuota", {
                  pct: pctOfQuota,
                  quota: formatBytes(u.quotaBytes!, locale),
                })}
          </span>
        </span>
      </button>
      <div className="px-3 pb-3">
        <StackedBar b={u.breakdown} total={total} />
      </div>
      {open && (
        <div className="grid gap-4 border-t border-slate-200 p-3 sm:grid-cols-2 dark:border-slate-800">
          <div>
            <div className="mb-1 text-xs font-medium uppercase text-slate-500">
              {t("insights.byType")}
            </div>
            <dl className="space-y-1">
              {KINDS.map(({ key, cls }) => (
                <div key={key} className="flex items-center gap-2 text-sm">
                  <span className={`h-2 w-2 shrink-0 rounded-full ${cls}`} />
                  <dt className="flex-1 text-slate-600 dark:text-slate-300">
                    {t(`storage.bucket.${key}`)}
                  </dt>
                  <dd className="tabular-nums">
                    {formatBytes(u.breakdown[key], locale)}
                  </dd>
                </div>
              ))}
            </dl>
          </div>
          <div>
            <div className="mb-1 text-xs font-medium uppercase text-slate-500">
              {t("insights.activity")}
            </div>
            <dl className="space-y-1 text-sm">
              {(
                [
                  [
                    t("insights.lastSeen"),
                    u.lastSeenAt ? fmtDate(u.lastSeenAt) : t("insights.never"),
                  ],
                  [t("insights.signedUp"), fmtDate(u.createdAt)],
                  [t("insights.sessions"), String(u.activeSessions)],
                  [
                    t("insights.twoFactor"),
                    u.twoFactorEnabled ? t("insights.on") : t("insights.off"),
                  ],
                  [t("sidebar.home"), String(u.counts.folders)],
                  [t("insights.bookmarks"), String(u.counts.bookmarks)],
                  [t("insights.snapshots"), String(u.counts.snapshots)],
                  [t("insights.attachments"), String(u.counts.attachments)],
                  [t("sidebar.databases"), String(u.counts.databases)],
                  [t("sidebar.panels"), String(u.counts.panels)],
                  [t("sidebar.tags"), String(u.counts.tags)],
                  [t("sidebar.trash"), String(u.counts.trashed)],
                ] as [string, string][]
              ).map(([label, v]) => (
                <div key={label} className="flex gap-2">
                  <dt className="flex-1 text-slate-600 dark:text-slate-300">
                    {label}
                  </dt>
                  <dd className="tabular-nums">{v}</dd>
                </div>
              ))}
            </dl>
          </div>
        </div>
      )}
    </div>
  );
}

export function AdminInsights() {
  const { t, i18n } = useTranslation();
  const q = useQuery({
    queryKey: ["admin-insights"],
    queryFn: api.adminInsights,
    // Walking every account's blob tree is the expensive part, so this is not
    // a screen to refetch on every focus.
    staleTime: 60_000,
  });

  if (q.isLoading) {
    return <div className="text-sm text-slate-400">{t("common.loading")}</div>;
  }
  if (!q.data) {
    return <div className="text-sm text-red-600">{t("common.error")}</div>;
  }
  const { instance, users, generatedAt } = q.data;
  const locale = i18n.language;

  return (
    <div className="space-y-6">
      <p className="rounded-lg bg-slate-50 p-3 text-xs text-slate-600 dark:bg-slate-800/50 dark:text-slate-300">
        {t("insights.privacyNote")}
      </p>

      <div>
        <h3 className="mb-2 text-sm font-medium">{t("insights.instance")}</h3>
        <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
          <Stat
            label={t("insights.users")}
            value={String(instance.users)}
            hint={t("insights.adminsN", { count: instance.admins })}
          />
          <Stat
            label={t("insights.active")}
            value={String(instance.activeWeek)}
            hint={t("insights.activeHint", {
              day: instance.activeDay,
              month: instance.activeMonth,
            })}
          />
          <Stat
            label={t("insights.storage")}
            value={formatBytes(instance.storageBytes, locale)}
            hint={t("insights.snapshotsShare", {
              pct:
                instance.storageBytes > 0
                  ? Math.round(
                      (instance.breakdown.snapshots / instance.storageBytes) * 100,
                    )
                  : 0,
            })}
          />
          <Stat
            label={t("insights.bookmarks")}
            value={instance.counts.bookmarks.toLocaleString(locale)}
            hint={t("insights.foldersN", { count: instance.counts.folders })}
          />
          <Stat
            label={t("insights.newUsers")}
            value={String(instance.newUsersMonth)}
            hint={t("insights.neverIn", { count: instance.neverSignedIn })}
          />
          <Stat
            label={t("insights.sharing")}
            value={String(instance.shares)}
            hint={t("insights.groupsAndLinks", {
              groups: instance.groups,
              links: instance.publicLinks,
            })}
          />
          <Stat
            label={t("insights.snapshots")}
            value={instance.counts.snapshots.toLocaleString(locale)}
            hint={t("insights.attachmentsN", {
              count: instance.counts.attachments,
            })}
          />
          <Stat
            label={t("insights.jobs")}
            value={String(instance.jobs.pending + instance.jobs.running)}
            hint={t("insights.jobsFailed", { count: instance.jobs.error })}
          />
        </div>
      </div>

      <div>
        <h3 className="mb-2 text-sm font-medium">
          {t("insights.storageByType")}
        </h3>
        <StackedBar b={instance.breakdown} total={instance.storageBytes} />
        <dl className="mt-2 grid grid-cols-2 gap-x-4 gap-y-1 sm:grid-cols-3">
          {KINDS.map(({ key, cls }) => (
            <div key={key} className="flex items-center gap-2 text-sm">
              <span className={`h-2 w-2 shrink-0 rounded-full ${cls}`} />
              <dt className="flex-1 truncate text-slate-600 dark:text-slate-300">
                {t(`storage.bucket.${key}`)}
              </dt>
              <dd className="tabular-nums">
                {formatBytes(instance.breakdown[key], locale)}
              </dd>
            </div>
          ))}
        </dl>
      </div>

      <div>
        <h3 className="mb-2 text-sm font-medium">{t("insights.logins")}</h3>
        <ActivityStrip days={instance.activity} />
      </div>

      <div>
        <h3 className="mb-2 text-sm font-medium">
          {t("insights.perUser", { count: users.length })}
        </h3>
        <div className="space-y-2">
          {users.map((u) => (
            <UserRow key={u.userId} u={u} locale={locale} />
          ))}
        </div>
      </div>

      <p className="text-xs text-slate-500 dark:text-slate-400">
        {t("insights.generatedAt", { at: fmtDate(generatedAt) })}
      </p>
    </div>
  );
}
