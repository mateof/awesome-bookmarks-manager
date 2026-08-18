import {
  SUSPICIOUS_TYPES,
  type SecurityEvent,
  type SecurityEventType,
  type SecurityLogPage,
  type SecurityLogQuery,
  type SecuritySummary,
} from "@awesome-bookmarks/shared";
import type { FastifyRequest } from "fastify";
import { v4 as uuidv4 } from "uuid";
import { clientIp } from "../auth/trusted.js";
import { getSqlite } from "../db/client.js";

/**
 * The security log.
 *
 * Recording is fire-and-forget by design: an audit trail must never be able to
 * break the request it is describing, so every failure here is swallowed and
 * logged to stderr. The cost of a lost line is much lower than the cost of a
 * login endpoint that 500s because a log insert failed.
 */

const RETENTION_DAYS_KEY = "security_log_retention_days";
const DEFAULT_RETENTION_DAYS = 90;

export interface RecordInput {
  type: SecurityEventType;
  req?: FastifyRequest;
  userId?: string | null;
  subject?: string | null;
  status?: number | null;
  detail?: string | null;
  /** When there is no request in scope (background jobs). */
  ip?: string;
}

export function recordEvent(input: RecordInput): void {
  try {
    const req = input.req;
    getSqlite()
      .prepare(
        `INSERT INTO security_events
           (id, at, type, user_id, subject, ip, user_agent, method, path, status, detail)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      )
      .run(
        uuidv4(),
        new Date().toISOString(),
        input.type,
        input.userId ?? null,
        input.subject ?? null,
        input.ip ?? (req ? clientIp(req) : ""),
        String(req?.headers["user-agent"] ?? "").slice(0, 512),
        req?.method ?? "",
        // Query strings can carry tokens (`?token=` on the MCP endpoint), so
        // only the path is kept.
        (req?.url ?? "").split("?")[0]?.slice(0, 256) ?? "",
        input.status ?? null,
        input.detail ?? null,
      );
    maybePrune();
  } catch (err) {
    console.warn(
      "[security-log] could not record event",
      err instanceof Error ? err.message : err,
    );
  }
}

export function getRetentionDays(): number {
  const row = getSqlite()
    .prepare(`SELECT value FROM app_settings WHERE key = ?`)
    .get(RETENTION_DAYS_KEY) as { value?: string } | undefined;
  const n = Number(row?.value);
  return Number.isFinite(n) && n > 0 ? n : DEFAULT_RETENTION_DAYS;
}

export function setRetentionDays(days: number) {
  getSqlite()
    .prepare(
      `INSERT INTO app_settings (key, value) VALUES (?, ?)
       ON CONFLICT(key) DO UPDATE SET value = excluded.value`,
    )
    .run(RETENTION_DAYS_KEY, String(Math.max(1, Math.floor(days))));
}

// Pruning on a timer would need a scheduler entry; pruning on every insert
// would be wasteful. Once every few hundred events is often enough for a log
// that grows slowly.
let sinceLastPrune = 0;
function maybePrune() {
  if (++sinceLastPrune < 200) return;
  sinceLastPrune = 0;
  pruneOldEvents();
}

export function pruneOldEvents(): number {
  const cutoff = new Date(
    Date.now() - getRetentionDays() * 86_400_000,
  ).toISOString();
  const res = getSqlite()
    .prepare(`DELETE FROM security_events WHERE at < ?`)
    .run(cutoff);
  return Number(res.changes ?? 0);
}

interface Row {
  id: string;
  at: string;
  type: string;
  user_id: string | null;
  subject: string | null;
  ip: string;
  user_agent: string;
  method: string;
  path: string;
  status: number | null;
  detail: string | null;
}

function toEvent(r: Row): SecurityEvent {
  return {
    id: r.id,
    at: r.at,
    type: r.type as SecurityEventType,
    userId: r.user_id,
    subject: r.subject,
    ip: r.ip,
    userAgent: r.user_agent,
    method: r.method,
    path: r.path,
    status: r.status,
    detail: r.detail,
  };
}

/** Build the shared WHERE clause for both the page and its total. */
function buildFilter(q: SecurityLogQuery): {
  clause: string;
  params: unknown[];
} {
  const parts: string[] = [];
  const params: unknown[] = [];

  if (q.type) {
    const types = q.type.split(",").map((s) => s.trim()).filter(Boolean);
    if (types.length > 0) {
      parts.push(`type IN (${types.map(() => "?").join(",")})`);
      params.push(...types);
    }
  }
  if (q.suspiciousOnly) {
    parts.push(`type IN (${SUSPICIOUS_TYPES.map(() => "?").join(",")})`);
    params.push(...SUSPICIOUS_TYPES);
  }
  if (q.subject) {
    parts.push(`(subject LIKE ? OR user_id = ?)`);
    params.push(`%${q.subject}%`, q.subject);
  }
  if (q.ip) {
    parts.push(`ip LIKE ?`);
    params.push(`%${q.ip}%`);
  }
  if (q.path) {
    parts.push(`path LIKE ?`);
    params.push(`%${q.path}%`);
  }
  if (q.status) {
    // "4xx" and "5xx" are the useful shapes; an exact code also works.
    if (/^[45]xx$/i.test(q.status)) {
      const base = Number(q.status[0]) * 100;
      parts.push(`status >= ? AND status < ?`);
      params.push(base, base + 100);
    } else if (/^\d{3}$/.test(q.status)) {
      parts.push(`status = ?`);
      params.push(Number(q.status));
    }
  }
  if (q.since) {
    parts.push(`at >= ?`);
    params.push(q.since);
  }
  if (q.until) {
    parts.push(`at <= ?`);
    params.push(q.until);
  }

  return {
    clause: parts.length > 0 ? `WHERE ${parts.join(" AND ")}` : "",
    params,
  };
}

export function queryEvents(q: SecurityLogQuery): SecurityLogPage {
  const sql = getSqlite();
  const { clause, params } = buildFilter(q);
  const rows = sql
    .prepare(
      `SELECT * FROM security_events ${clause}
       ORDER BY at DESC, rowid DESC
       LIMIT ? OFFSET ?`,
    )
    .all(...params, q.limit, q.offset) as Row[];
  const total = sql
    .prepare(`SELECT count(*) AS n FROM security_events ${clause}`)
    .get(...params) as { n: number };
  return { events: rows.map(toEvent), total: Number(total?.n ?? 0) };
}

export function summarize(windowHours: number): SecuritySummary {
  const sql = getSqlite();
  const since = new Date(Date.now() - windowHours * 3_600_000).toISOString();

  const scalar = (query: string, ...params: unknown[]): number => {
    const row = sql.prepare(query).get(...params) as { n?: number } | undefined;
    return Number(row?.n ?? 0);
  };

  const suspiciousPlaceholders = SUSPICIOUS_TYPES.map(() => "?").join(",");

  const byType = sql
    .prepare(
      `SELECT type, count(*) AS n FROM security_events
       WHERE at >= ? GROUP BY type ORDER BY n DESC`,
    )
    .all(since) as Array<{ type: string; n: number }>;

  const topOffenders = sql
    .prepare(
      `SELECT ip, count(*) AS n FROM security_events
       WHERE at >= ? AND ip != '' AND type IN (${suspiciousPlaceholders})
       GROUP BY ip ORDER BY n DESC LIMIT 10`,
    )
    .all(since, ...SUSPICIOUS_TYPES) as Array<{ ip: string; n: number }>;

  // SQLite has no date_trunc; the ISO string is already sortable, so slicing
  // to the hour is both the cheapest and the most obvious grouping.
  const perHour = sql
    .prepare(
      `SELECT substr(at, 1, 13) AS hour, count(*) AS n FROM security_events
       WHERE at >= ? GROUP BY hour ORDER BY hour ASC`,
    )
    .all(since) as Array<{ hour: string; n: number }>;

  return {
    windowHours,
    total: scalar(`SELECT count(*) AS n FROM security_events WHERE at >= ?`, since),
    suspicious: scalar(
      `SELECT count(*) AS n FROM security_events
       WHERE at >= ? AND type IN (${suspiciousPlaceholders})`,
      since,
      ...SUSPICIOUS_TYPES,
    ),
    failedLogins: scalar(
      `SELECT count(*) AS n FROM security_events WHERE at >= ? AND type = 'login_failed'`,
      since,
    ),
    uniqueIps: scalar(
      `SELECT count(DISTINCT ip) AS n FROM security_events WHERE at >= ? AND ip != ''`,
      since,
    ),
    byType: byType.map((r) => ({ type: r.type, count: Number(r.n) })),
    topOffenders: topOffenders.map((r) => ({ ip: r.ip, count: Number(r.n) })),
    perHour: perHour.map((r) => ({ hour: r.hour, count: Number(r.n) })),
  };
}
