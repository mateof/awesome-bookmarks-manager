import type { SecurityEvent, SecuritySummary } from "@awesome-bookmarks/shared";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { AlertTriangle, Globe, RefreshCw, ShieldAlert, X } from "lucide-react";
import { useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import { ApiError, api } from "../api.js";
import { fmtDateTime } from "../lib/date.js";

/**
 * Instance-wide security dashboard: what happened, who was refused, from where.
 *
 * The log only holds events worth looking at (refusals, logins, views of
 * published content), so this can afford to show everything by default and let
 * the filters narrow it, rather than making the operator guess a query before
 * seeing anything.
 */

const TYPES = [
  "login_ok",
  "login_failed",
  "login_2fa_required",
  "logout",
  "signup",
  "session_revoked",
  "password_changed",
  "twofa_enabled",
  "twofa_disabled",
  "panel_view",
  "panel_denied",
  "share_view",
  "share_denied",
  "unauthorized",
  "forbidden",
  "rate_limited",
  "quota_exceeded",
  "admin_action",
  "server_error",
] as const;

const SUSPICIOUS = new Set([
  "login_failed",
  "unauthorized",
  "forbidden",
  "rate_limited",
  "panel_denied",
  "share_denied",
]);

function typeLabel(t: (k: string) => string, type: string): string {
  const key = `securityLog.type.${type}`;
  const label = t(key);
  // A type the UI has no wording for yet still shows something useful.
  return label === key ? type : label;
}

function Badge({ type, label }: { type: string; label: string }) {
  const tone = SUSPICIOUS.has(type)
    ? "bg-red-100 text-red-700 dark:bg-red-950 dark:text-red-300"
    : type === "server_error"
      ? "bg-amber-100 text-amber-800 dark:bg-amber-950 dark:text-amber-300"
      : "bg-slate-100 text-slate-600 dark:bg-slate-800 dark:text-slate-300";
  return (
    <span className={`inline-block whitespace-nowrap rounded px-1.5 py-0.5 text-[11px] font-medium ${tone}`}>
      {label}
    </span>
  );
}

function Stat({
  label,
  value,
  tone,
  icon,
}: {
  label: string;
  value: number;
  tone?: "danger";
  icon: React.ReactNode;
}) {
  return (
    <div className="flex items-center gap-3 rounded-xl border border-slate-200 p-3 dark:border-slate-800">
      <div
        className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-lg ${
          tone === "danger"
            ? "bg-red-100 text-red-600 dark:bg-red-950 dark:text-red-400"
            : "bg-slate-100 text-slate-500 dark:bg-slate-800 dark:text-slate-300"
        }`}
      >
        {icon}
      </div>
      <div className="min-w-0">
        <div className="text-lg font-semibold tabular-nums">{value}</div>
        <div className="truncate text-xs text-slate-500">{label}</div>
      </div>
    </div>
  );
}

/** Per-hour activity as a bare bar strip; a chart library is not worth it. */
function Sparkline({ data }: { data: SecuritySummary["perHour"] }) {
  const max = Math.max(1, ...data.map((d) => d.count));
  if (data.length === 0) return null;
  return (
    <div className="flex h-12 items-end gap-0.5">
      {data.map((d) => (
        <div
          key={d.hour}
          title={`${d.hour}:00 — ${d.count}`}
          style={{ height: `${Math.max(4, (d.count / max) * 100)}%` }}
          className="min-w-[3px] flex-1 rounded-sm bg-slate-400 dark:bg-slate-600"
        />
      ))}
    </div>
  );
}

export function SecurityLog() {
  const { t } = useTranslation();
  const qc = useQueryClient();
  const [hours, setHours] = useState(24);
  const [type, setType] = useState("");
  const [subject, setSubject] = useState("");
  const [ip, setIp] = useState("");
  const [path, setPath] = useState("");
  const [status, setStatus] = useState("");
  const [suspiciousOnly, setSuspiciousOnly] = useState(false);
  const [offset, setOffset] = useState(0);
  const [err, setErr] = useState<string | null>(null);
  const limit = 100;

  const filters = useMemo(
    () => ({
      type: type || undefined,
      subject: subject.trim() || undefined,
      ip: ip.trim() || undefined,
      path: path.trim() || undefined,
      status: status.trim() || undefined,
      suspiciousOnly: suspiciousOnly || undefined,
      limit,
      offset,
    }),
    [type, subject, ip, path, status, suspiciousOnly, offset],
  );

  const summary = useQuery({
    queryKey: ["security-summary", hours],
    queryFn: () => api.securitySummary(hours),
  });
  const page = useQuery({
    queryKey: ["security-log", filters],
    queryFn: () => api.securityLog(filters),
  });
  const retention = useQuery({
    queryKey: ["security-retention"],
    queryFn: api.securityRetention,
  });

  const [retentionDraft, setRetentionDraft] = useState<string | null>(null);
  const saveRetention = useMutation({
    mutationFn: (days: number) => api.setSecurityRetention(days),
    onSuccess: () => {
      setErr(null);
      setRetentionDraft(null);
      qc.invalidateQueries({ queryKey: ["security-retention"] });
      qc.invalidateQueries({ queryKey: ["security-log"] });
    },
    onError: (e) => setErr(e instanceof ApiError ? e.message : t("common.error")),
  });

  const events = page.data?.events ?? [];
  const total = page.data?.total ?? 0;
  const clearFilters = () => {
    setType("");
    setSubject("");
    setIp("");
    setPath("");
    setStatus("");
    setSuspiciousOnly(false);
    setOffset(0);
  };
  const anyFilter =
    type || subject || ip || path || status || suspiciousOnly;

  return (
    <div className="space-y-4">
      {/* Dashboard */}
      <div className="flex flex-wrap items-center gap-2">
        <label className="text-xs text-slate-500">
          {t("securityLog.window")}
          <select
            value={hours}
            aria-label={t("securityLog.window")}
            onChange={(e) => setHours(Number(e.target.value))}
            className="ml-2 rounded-lg border border-slate-300 bg-white px-2 py-1 text-sm dark:border-slate-700 dark:bg-slate-800"
          >
            <option value={1}>{t("securityLog.lastHour")}</option>
            <option value={24}>{t("securityLog.last24h")}</option>
            <option value={24 * 7}>{t("securityLog.last7d")}</option>
            <option value={24 * 30}>{t("securityLog.last30d")}</option>
          </select>
        </label>
        <button
          type="button"
          onClick={() => {
            qc.invalidateQueries({ queryKey: ["security-summary"] });
            qc.invalidateQueries({ queryKey: ["security-log"] });
          }}
          className="ml-auto rounded-lg border border-slate-300 p-1.5 text-slate-500 hover:bg-slate-100 dark:border-slate-700 dark:hover:bg-slate-800"
          title={t("common.refresh")}
          aria-label={t("common.refresh")}
        >
          <RefreshCw className="h-4 w-4" />
        </button>
      </div>

      <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
        <Stat
          label={t("securityLog.statTotal")}
          value={summary.data?.total ?? 0}
          icon={<Globe className="h-4 w-4" />}
        />
        <Stat
          label={t("securityLog.statSuspicious")}
          value={summary.data?.suspicious ?? 0}
          tone={summary.data?.suspicious ? "danger" : undefined}
          icon={<ShieldAlert className="h-4 w-4" />}
        />
        <Stat
          label={t("securityLog.statFailedLogins")}
          value={summary.data?.failedLogins ?? 0}
          tone={summary.data?.failedLogins ? "danger" : undefined}
          icon={<AlertTriangle className="h-4 w-4" />}
        />
        <Stat
          label={t("securityLog.statUniqueIps")}
          value={summary.data?.uniqueIps ?? 0}
          icon={<Globe className="h-4 w-4" />}
        />
      </div>

      {(summary.data?.perHour.length ?? 0) > 0 && (
        <div className="rounded-xl border border-slate-200 p-3 dark:border-slate-800">
          <div className="mb-2 text-xs text-slate-500">
            {t("securityLog.perHour")}
          </div>
          <Sparkline data={summary.data?.perHour ?? []} />
        </div>
      )}

      {(summary.data?.topOffenders.length ?? 0) > 0 && (
        <div className="rounded-xl border border-slate-200 p-3 dark:border-slate-800">
          <div className="mb-2 text-xs font-medium text-slate-500">
            {t("securityLog.topOffenders")}
          </div>
          <ul className="flex flex-wrap gap-2">
            {summary.data?.topOffenders.map((o) => (
              <li key={o.ip}>
                <button
                  type="button"
                  onClick={() => {
                    setIp(o.ip);
                    setOffset(0);
                  }}
                  className="rounded-full border border-red-300 px-2.5 py-0.5 text-xs text-red-700 hover:bg-red-50 dark:border-red-900 dark:text-red-300 dark:hover:bg-red-950"
                >
                  <span className="tabular-nums">{o.ip}</span> · {o.count}
                </button>
              </li>
            ))}
          </ul>
        </div>
      )}

      {/* Filters */}
      <div className="flex flex-wrap items-end gap-2 rounded-xl border border-slate-200 p-3 dark:border-slate-800">
        <label className="text-xs text-slate-500">
          {t("securityLog.filterType")}
          <select
            value={type}
            aria-label={t("securityLog.filterType")}
            onChange={(e) => {
              setType(e.target.value);
              setOffset(0);
            }}
            className="mt-1 block w-44 rounded-lg border border-slate-300 bg-white px-2 py-1 text-sm dark:border-slate-700 dark:bg-slate-800"
          >
            <option value="">{t("securityLog.allTypes")}</option>
            {TYPES.map((ty) => (
              <option key={ty} value={ty}>
                {typeLabel(t as (k: string) => string, ty)}
              </option>
            ))}
          </select>
        </label>
        <label className="text-xs text-slate-500">
          {t("securityLog.filterSubject")}
          <input
            value={subject}
            aria-label={t("securityLog.filterSubject")}
            onChange={(e) => {
              setSubject(e.target.value);
              setOffset(0);
            }}
            placeholder="alguien@example.com"
            className="mt-1 block w-52 rounded-lg border border-slate-300 bg-white px-2 py-1 text-sm dark:border-slate-700 dark:bg-slate-800"
          />
        </label>
        <label className="text-xs text-slate-500">
          {t("securityLog.filterIp")}
          <input
            value={ip}
            aria-label={t("securityLog.filterIp")}
            onChange={(e) => {
              setIp(e.target.value);
              setOffset(0);
            }}
            placeholder="192.168."
            className="mt-1 block w-36 rounded-lg border border-slate-300 bg-white px-2 py-1 text-sm dark:border-slate-700 dark:bg-slate-800"
          />
        </label>
        <label className="text-xs text-slate-500">
          {t("securityLog.filterPath")}
          <input
            value={path}
            aria-label={t("securityLog.filterPath")}
            onChange={(e) => {
              setPath(e.target.value);
              setOffset(0);
            }}
            placeholder="/api/auth"
            className="mt-1 block w-40 rounded-lg border border-slate-300 bg-white px-2 py-1 text-sm dark:border-slate-700 dark:bg-slate-800"
          />
        </label>
        <label className="text-xs text-slate-500">
          {t("securityLog.filterStatus")}
          <input
            value={status}
            aria-label={t("securityLog.filterStatus")}
            onChange={(e) => {
              setStatus(e.target.value);
              setOffset(0);
            }}
            placeholder="4xx"
            className="mt-1 block w-20 rounded-lg border border-slate-300 bg-white px-2 py-1 text-sm dark:border-slate-700 dark:bg-slate-800"
          />
        </label>
        <label className="flex items-center gap-1.5 pb-1 text-xs text-slate-600 dark:text-slate-300">
          <input
            type="checkbox"
            checked={suspiciousOnly}
            onChange={(e) => {
              setSuspiciousOnly(e.target.checked);
              setOffset(0);
            }}
          />
          {t("securityLog.onlySuspicious")}
        </label>
        {anyFilter && (
          <button
            type="button"
            onClick={clearFilters}
            className="mb-1 inline-flex items-center gap-1 text-xs text-slate-500 hover:text-red-600"
          >
            <X className="h-3 w-3" /> {t("tags.clearFilter")}
          </button>
        )}
      </div>

      {err && (
        <div className="rounded-lg bg-red-50 p-2 text-sm text-red-700 dark:bg-red-950 dark:text-red-300">
          {err}
        </div>
      )}

      {/* Events */}
      <div className="overflow-x-auto">
        <table data-testid="security-events" className="w-full min-w-[46rem] text-sm">
          <thead>
            <tr className="border-b border-slate-200 text-left text-xs uppercase text-slate-500 dark:border-slate-800">
              <th className="py-2 pr-2 font-medium">{t("securityLog.colWhen")}</th>
              <th className="py-2 pr-2 font-medium">{t("securityLog.colType")}</th>
              <th className="py-2 pr-2 font-medium">{t("securityLog.colSubject")}</th>
              <th className="py-2 pr-2 font-medium">{t("securityLog.colIp")}</th>
              <th className="py-2 pr-2 font-medium">{t("securityLog.colRequest")}</th>
            </tr>
          </thead>
          <tbody>
            {events.map((e) => (
              <Row key={e.id} event={e} onPickIp={(v) => { setIp(v); setOffset(0); }} />
            ))}
          </tbody>
        </table>
      </div>

      {page.isLoading && <p className="text-sm text-slate-400">{t("common.loading")}</p>}
      {!page.isLoading && events.length === 0 && (
        <p className="text-sm text-slate-400">{t("securityLog.empty")}</p>
      )}

      {total > limit && (
        <div className="flex items-center gap-2 text-sm">
          <button
            type="button"
            disabled={offset === 0}
            onClick={() => setOffset(Math.max(0, offset - limit))}
            className="rounded-lg border border-slate-300 px-3 py-1 disabled:opacity-40 dark:border-slate-700"
          >
            {t("common.back")}
          </button>
          <span className="text-xs text-slate-500">
            {offset + 1}–{Math.min(offset + limit, total)} / {total}
          </span>
          <button
            type="button"
            disabled={offset + limit >= total}
            onClick={() => setOffset(offset + limit)}
            className="rounded-lg border border-slate-300 px-3 py-1 disabled:opacity-40 dark:border-slate-700"
          >
            {t("securityLog.next")}
          </button>
        </div>
      )}

      {/* Retention */}
      <div className="flex flex-wrap items-center gap-2 border-t border-slate-200 pt-3 dark:border-slate-800">
        <label className="text-xs text-slate-500">
          {t("securityLog.retention")}
          <input
            value={retentionDraft ?? String(retention.data?.days ?? 90)}
            onChange={(e) => setRetentionDraft(e.target.value)}
            inputMode="numeric"
            className="ml-2 w-20 rounded-lg border border-slate-300 bg-white px-2 py-1 text-sm dark:border-slate-700 dark:bg-slate-800"
          />
        </label>
        <button
          type="button"
          disabled={retentionDraft === null || saveRetention.isPending}
          onClick={() => {
            const days = Number(retentionDraft);
            if (!Number.isFinite(days) || days < 1) {
              setErr(t("securityLog.badRetention"));
              return;
            }
            saveRetention.mutate(Math.floor(days));
          }}
          className="rounded-lg border border-slate-300 px-3 py-1 text-sm disabled:opacity-40 dark:border-slate-700"
        >
          {t("common.save")}
        </button>
        <span className="text-xs text-slate-400">{t("securityLog.retentionHint")}</span>
      </div>
    </div>
  );
}

function Row({
  event,
  onPickIp,
}: {
  event: SecurityEvent;
  onPickIp: (ip: string) => void;
}) {
  const { t } = useTranslation();
  return (
    <tr className="border-b border-slate-100 last:border-0 align-top dark:border-slate-800/60">
      <td className="whitespace-nowrap py-1.5 pr-2 text-xs tabular-nums text-slate-500">
        {fmtDateTime(event.at)}
      </td>
      <td className="py-1.5 pr-2">
        <Badge
          type={event.type}
          label={typeLabel(t as (k: string) => string, event.type)}
        />
      </td>
      <td className="max-w-[14rem] truncate py-1.5 pr-2" title={event.subject ?? ""}>
        {event.subject ?? <span className="text-slate-400">—</span>}
      </td>
      <td className="py-1.5 pr-2">
        {event.ip ? (
          <button
            type="button"
            onClick={() => onPickIp(event.ip)}
            className="tabular-nums text-slate-600 hover:underline dark:text-slate-300"
          >
            {event.ip}
          </button>
        ) : (
          <span className="text-slate-400">—</span>
        )}
      </td>
      <td className="py-1.5">
        <div className="flex flex-wrap items-center gap-1.5">
          {event.status !== null && (
            <span
              className={`tabular-nums text-xs ${
                event.status >= 500
                  ? "text-amber-600"
                  : event.status >= 400
                    ? "text-red-600"
                    : "text-slate-400"
              }`}
            >
              {event.status}
            </span>
          )}
          <code className="truncate text-xs text-slate-500">
            {event.method} {event.path}
          </code>
          {event.detail && (
            <span className="rounded bg-slate-100 px-1.5 text-[11px] text-slate-500 dark:bg-slate-800">
              {event.detail}
            </span>
          )}
        </div>
        {event.userAgent && (
          <div className="truncate text-[11px] text-slate-400" title={event.userAgent}>
            {event.userAgent}
          </div>
        )}
      </td>
    </tr>
  );
}
