import type {
  AdminInsights,
  InsightsCounts,
  InsightsDay,
  InsightsUser,
  StorageBreakdown,
} from "@awesome-bookmarks/shared";
import { sql } from "drizzle-orm";
import type { AuthedContext } from "../auth/session.js";
import { getDb } from "../db/client.js";
import { users } from "../db/schema.js";
import { quotaFor, totalOf, usageFor } from "../storage/usage.js";
import { ensureAdmin } from "./service.js";

/**
 * What an admin can be told about everyone else.
 *
 * The shape of this file is decided by one fact: **an admin holds nobody's
 * key**. Content is sealed with a key derived from each user's password, and
 * the server only ever has it while that person is logged in. So there is no
 * query here that opens a field, and adding one would not be a feature, it
 * would be a hole.
 *
 * What is left is plenty for the job the panel exists to do — who is filling
 * the disk, who has stopped using the instance, what is failing — because
 * counts, byte sizes and timestamps were never encrypted in the first place.
 *
 * Every count is a `GROUP BY` over an indexed column rather than a query per
 * user, so this stays one pass regardless of how many accounts there are. The
 * exception is disk usage, which walks the blob tree; that is cached per user
 * by `usageFor`, and it is the reason this endpoint is not free.
 */

/** `count(*)` per user for one table, as a map. */
function countsByUser(
  table: string,
  where = "1=1",
): Map<string, number> {
  const rows = getDb().all<{ user_id: string; n: number }>(
    sql.raw(
      `SELECT user_id, count(*) AS n FROM ${table} WHERE ${where} GROUP BY user_id`,
    ),
  );
  return new Map(rows.map((r) => [r.user_id, Number(r.n)]));
}

function one(table: string, where = "1=1"): number {
  const row = getDb().get<{ n: number }>(
    sql.raw(`SELECT count(*) AS n FROM ${table} WHERE ${where}`),
  );
  return Number(row?.n ?? 0);
}

const ALIVE = "deleted_at IS NULL";

/** ISO for "n days before now", to compare against stored timestamps. */
function daysAgo(n: number): string {
  return new Date(Date.now() - n * 86_400_000).toISOString();
}

function emptyCounts(): InsightsCounts {
  return {
    bookmarks: 0,
    folders: 0,
    tags: 0,
    attachments: 0,
    databases: 0,
    panels: 0,
    smartFolders: 0,
    snapshots: 0,
    trashed: 0,
  };
}

function addBreakdown(
  into: StorageBreakdown,
  from: StorageBreakdown,
): StorageBreakdown {
  return {
    snapshots: into.snapshots + from.snapshots,
    images: into.images + from.images,
    icons: into.icons + from.icons,
    panelAssets: into.panelAssets + from.panelAssets,
    attachments: into.attachments + from.attachments,
    database: into.database + from.database,
  };
}

/**
 * Logins and failed logins per day for the last 30, oldest first.
 *
 * Days with nothing are filled in rather than skipped: a strip with gaps
 * silently redraws itself as "busy" when the instance was idle.
 */
function activityByDay(): InsightsDay[] {
  const since = daysAgo(30);
  const rows = getDb().all<{ d: string; type: string; n: number }>(
    sql.raw(
      `SELECT substr(at, 1, 10) AS d, type, count(*) AS n
         FROM security_events
        WHERE at >= '${since}' AND type IN ('login', 'login_failed')
        GROUP BY d, type`,
    ),
  );
  const byDay = new Map<string, { logins: number; failedLogins: number }>();
  for (const r of rows) {
    const slot = byDay.get(r.d) ?? { logins: 0, failedLogins: 0 };
    if (r.type === "login") slot.logins = Number(r.n);
    else slot.failedLogins = Number(r.n);
    byDay.set(r.d, slot);
  }
  const out: InsightsDay[] = [];
  for (let i = 29; i >= 0; i--) {
    const date = daysAgo(i).slice(0, 10);
    const slot = byDay.get(date) ?? { logins: 0, failedLogins: 0 };
    out.push({ date, ...slot });
  }
  return out;
}

export async function getInsights(ctx: AuthedContext): Promise<AdminInsights> {
  ensureAdmin(ctx);

  const accounts = getDb()
    .select({
      id: users.id,
      email: users.email,
      nickname: users.nickname,
      role: users.role,
      createdAt: users.createdAt,
      twoFactorEnabled: users.twoFactorEnabled,
    })
    .from(users)
    .all();

  const bookmarks = countsByUser("bookmarks", ALIVE);
  const folders = countsByUser("folders", ALIVE);
  const tags = countsByUser("tags");
  // Only bookmarks and folders are soft-deleted; the rest go for good, so
  // filtering them on a column they do not have is an error at runtime and
  // nowhere else.
  const attachments = countsByUser("attachments");
  const databases = countsByUser("databases");
  const panels = countsByUser("panels");
  const smartFolders = countsByUser("smart_folders");
  const snapshots = countsByUser(
    "bookmarks",
    `${ALIVE} AND snapshot_html_path IS NOT NULL`,
  );
  // Counted across both tables, because "what is sitting in the bin" is one
  // question to an admin even though it is two tables to us.
  const trashedBookmarks = countsByUser("bookmarks", "deleted_at IS NOT NULL");
  const trashedFolders = countsByUser("folders", "deleted_at IS NOT NULL");

  // Last activity on any session, revoked included: a revoked session still
  // tells you when that person was last here, which is the question.
  const lastSeen = new Map<string, string>(
    getDb()
      .all<{ user_id: string; last: string }>(
        sql.raw(
          `SELECT user_id, max(last_seen_at) AS last FROM user_sessions GROUP BY user_id`,
        ),
      )
      .map((r) => [r.user_id, r.last]),
  );
  const activeSessions = countsByUser(
    "user_sessions",
    `revoked_at IS NULL`,
  );

  const rows: InsightsUser[] = [];
  let storageBytes = 0;
  let breakdown: StorageBreakdown = {
    snapshots: 0,
    images: 0,
    icons: 0,
    panelAssets: 0,
    attachments: 0,
    database: 0,
  };
  const totals = emptyCounts();

  for (const a of accounts) {
    const used = await usageFor(a.id);
    const quota = quotaFor(a.id);
    const counts: InsightsCounts = {
      bookmarks: bookmarks.get(a.id) ?? 0,
      folders: folders.get(a.id) ?? 0,
      tags: tags.get(a.id) ?? 0,
      attachments: attachments.get(a.id) ?? 0,
      databases: databases.get(a.id) ?? 0,
      panels: panels.get(a.id) ?? 0,
      smartFolders: smartFolders.get(a.id) ?? 0,
      snapshots: snapshots.get(a.id) ?? 0,
      trashed: (trashedBookmarks.get(a.id) ?? 0) + (trashedFolders.get(a.id) ?? 0),
    };
    for (const k of Object.keys(totals) as (keyof InsightsCounts)[]) {
      totals[k] += counts[k];
    }
    const usedBytes = totalOf(used);
    storageBytes += usedBytes;
    breakdown = addBreakdown(breakdown, used);

    rows.push({
      userId: a.id,
      email: a.email,
      nickname: a.nickname,
      role: a.role as InsightsUser["role"],
      createdAt: a.createdAt,
      lastSeenAt: lastSeen.get(a.id) ?? null,
      activeSessions: activeSessions.get(a.id) ?? 0,
      twoFactorEnabled: !!a.twoFactorEnabled,
      usedBytes,
      quotaBytes: quota.bytes,
      quotaSource: quota.source,
      breakdown: used,
      counts,
    });
  }

  // Heaviest first: the panel exists to spot who is filling the disk, not to
  // read an alphabetical list.
  rows.sort((a, b) => b.usedBytes - a.usedBytes);

  const day = daysAgo(1);
  const week = daysAgo(7);
  const month = daysAgo(30);
  const seenSince = (since: string) =>
    rows.filter((r) => r.lastSeenAt !== null && r.lastSeenAt >= since).length;

  const jobRows = getDb().all<{ status: string; n: number }>(
    sql.raw(`SELECT status, count(*) AS n FROM jobs GROUP BY status`),
  );
  const jobs = { pending: 0, running: 0, error: 0, done: 0 };
  for (const j of jobRows) {
    if (j.status in jobs) jobs[j.status as keyof typeof jobs] = Number(j.n);
  }

  return {
    instance: {
      users: accounts.length,
      admins: accounts.filter((a) => a.role === "admin").length,
      activeDay: seenSince(day),
      activeWeek: seenSince(week),
      activeMonth: seenSince(month),
      newUsersMonth: accounts.filter((a) => a.createdAt >= month).length,
      neverSignedIn: rows.filter((r) => r.lastSeenAt === null).length,
      counts: totals,
      groups: one("groups"),
      shares: one("group_shares"),
      publicLinks: one("share_links"),
      storageBytes,
      breakdown,
      jobs,
      activity: activityByDay(),
    },
    users: rows,
    generatedAt: new Date().toISOString(),
  };
}
