import type { StorageBreakdown } from "@awesome-bookmarks/shared";
import { readdir, stat } from "node:fs/promises";
import { join } from "node:path";
import { getSqlite } from "../db/client.js";
import { AppError } from "../util/errors.js";
import { userBlobDir } from "./blobs.js";

/**
 * How much disk a user is taking, and whether they are allowed any more.
 *
 * Two sources add up. Blobs on disk are the ones that matter: a saved page
 * snapshot is 100 kB to 5 MB, and an account with 20.000 bookmarks can quietly
 * become tens of gigabytes. Encrypted rows are also counted, but they are a
 * rounding error next to that, and they are an estimate — SQLite's per-row and
 * index overhead is not attributable to a user.
 *
 * The total is cached per user. Walking the blob tree costs one `stat` per
 * file, which is fine occasionally and not fine on every upload during a
 * 5.000-bookmark import, so writes adjust the cached figure by their delta
 * instead of invalidating it.
 */

export const QuotaExceeded = (msg: string) =>
  new AppError(413, "quota_exceeded", msg);

/** True for the error above, wherever it surfaced from. */
export function isQuotaError(err: unknown): boolean {
  return err instanceof AppError && err.code === "quota_exceeded";
}

const EMPTY: StorageBreakdown = {
  snapshots: 0,
  images: 0,
  icons: 0,
  panelAssets: 0,
  attachments: 0,
  database: 0,
};

interface Entry {
  breakdown: StorageBreakdown;
  computedAt: number;
}

const cache = new Map<string, Entry>();

/** Recompute from disk after this long, so drift can never accumulate. */
const TTL_MS = 5 * 60_000;

export function invalidateUsage(userId: string) {
  cache.delete(userId);
}

/** Drop everything; used by tests and after a bulk purge. */
export function invalidateAllUsage() {
  cache.clear();
}

/**
 * Which bucket a blob belongs to, from the path layout written by
 * storage/blobs.ts: `<userId>/{bookmarks,folders,panels}/<id>/<file>`.
 */
function bucketOf(relPath: string): keyof StorageBreakdown {
  const file = relPath.split("/").pop() ?? "";
  if (relPath.includes("/attachments/")) return "attachments";
  if (relPath.includes("/panels/")) return "panelAssets";
  if (file === "page.html.bin" || file === "text.bin" || file.startsWith("screenshot")) {
    return "snapshots";
  }
  if (file === "user-bg.bin") return "images";
  return "icons";
}

async function walkBlobs(userId: string): Promise<StorageBreakdown> {
  const root = userBlobDir(userId);
  const out: StorageBreakdown = { ...EMPTY };

  async function recurse(dir: string, rel: string) {
    let entries;
    try {
      entries = await readdir(dir, { withFileTypes: true });
    } catch {
      return; // no blobs yet, or the directory vanished mid-walk
    }
    for (const e of entries) {
      const abs = join(dir, e.name);
      const next = rel ? `${rel}/${e.name}` : e.name;
      if (e.isDirectory()) {
        await recurse(abs, next);
      } else if (e.isFile()) {
        try {
          const s = await stat(abs);
          out[bucketOf(next)] += s.size;
        } catch {
          /* removed between readdir and stat; skip */
        }
      }
    }
  }

  await recurse(root, "");
  return out;
}

/**
 * Bytes held in encrypted columns for this user. A sum of stored field
 * lengths, deliberately not an attempt to model SQLite page overhead: the
 * point is to explain the number the user sees, not to audit the file.
 */
function databaseBytes(userId: string): number {
  const sql = getSqlite();
  const one = (query: string, ...params: unknown[]): number => {
    try {
      const row = sql.prepare(query).get(...params) as { n?: number } | undefined;
      return Number(row?.n ?? 0);
    } catch {
      // A table may not exist yet on a partially-migrated database; a missing
      // contribution is better than failing the whole report.
      return 0;
    }
  };

  return (
    one(
      `SELECT COALESCE(SUM(
         length(title_ct) + length(url_ct) + COALESCE(length(description_ct), 0)
       ), 0) AS n FROM bookmarks WHERE user_id = ?`,
      userId,
    ) +
    one(
      `SELECT COALESCE(SUM(
         length(name_ct) + COALESCE(length(description_ct), 0)
       ), 0) AS n FROM folders WHERE user_id = ?`,
      userId,
    ) +
    one(
      `SELECT COALESCE(SUM(length(payload_ct)), 0) AS n
       FROM entity_versions WHERE user_id = ?`,
      userId,
    ) +
    one(
      `SELECT COALESCE(SUM(length(cells_ct)), 0) AS n
       FROM database_rows WHERE user_id = ?`,
      userId,
    ) +
    one(
      `SELECT COALESCE(SUM(
         length(name_ct) + COALESCE(length(config_ct), 0)
       ), 0) AS n FROM database_columns WHERE user_id = ?`,
      userId,
    ) +
    one(
      `SELECT COALESCE(SUM(length(payload_ct)), 0) AS n
       FROM panels WHERE user_id = ? AND payload_ct IS NOT NULL`,
      userId,
    ) +
    one(
      `SELECT COALESCE(SUM(length(payload_ct)), 0) AS n
       FROM share_links WHERE user_id = ? AND payload_ct IS NOT NULL`,
      userId,
    ) +
    one(
      `SELECT COALESCE(SUM(length(payload_ct)), 0) AS n
       FROM group_shares WHERE shared_by = ? AND payload_ct IS NOT NULL`,
      userId,
    ) +
    one(
      `SELECT COALESCE(SUM(length(name_ct) + length(query_ct)), 0) AS n
       FROM smart_folders WHERE user_id = ?`,
      userId,
    ) +
    one(
      `SELECT COALESCE(SUM(length(content)), 0) AS n
       FROM snapshots_fts WHERE user_id = ?`,
      userId,
    )
  );
}

export function totalOf(b: StorageBreakdown): number {
  return b.snapshots + b.images + b.icons + b.panelAssets + b.database;
}

export async function usageFor(
  userId: string,
  opts: { fresh?: boolean } = {},
): Promise<StorageBreakdown> {
  const hit = cache.get(userId);
  if (!opts.fresh && hit && Date.now() - hit.computedAt < TTL_MS) {
    return hit.breakdown;
  }
  const blobs = await walkBlobs(userId);
  const breakdown: StorageBreakdown = {
    ...blobs,
    database: databaseBytes(userId),
  };
  cache.set(userId, { breakdown, computedAt: Date.now() });
  return breakdown;
}

/**
 * Fold a write into the cached figure so a bulk import stays accurate without
 * re-walking the tree thousands of times. `delta` may be negative when a blob
 * is overwritten by a smaller one.
 */
export function noteBlobDelta(userId: string, relPath: string, delta: number) {
  const hit = cache.get(userId);
  if (!hit || delta === 0) return;
  const bucket = bucketOf(relPath);
  hit.breakdown[bucket] = Math.max(0, hit.breakdown[bucket] + delta);
}

/* ---- Quotas ----------------------------------------------------------- */

const DEFAULT_QUOTA_KEY = "default_storage_quota_bytes";

/** Instance-wide default. null = unlimited. */
export function getDefaultQuota(): number | null {
  const row = getSqlite()
    .prepare(`SELECT value FROM app_settings WHERE key = ?`)
    .get(DEFAULT_QUOTA_KEY) as { value?: string } | undefined;
  if (!row?.value) return null;
  const n = Number(row.value);
  return Number.isFinite(n) && n > 0 ? n : null;
}

export function setDefaultQuota(bytes: number | null) {
  const sql = getSqlite();
  if (bytes === null || bytes <= 0) {
    sql.prepare(`DELETE FROM app_settings WHERE key = ?`).run(DEFAULT_QUOTA_KEY);
    return;
  }
  sql
    .prepare(
      `INSERT INTO app_settings (key, value) VALUES (?, ?)
       ON CONFLICT(key) DO UPDATE SET value = excluded.value`,
    )
    .run(DEFAULT_QUOTA_KEY, String(Math.floor(bytes)));
}

export interface ResolvedQuota {
  bytes: number | null;
  source: "user" | "default" | "none";
}

/** The limit that applies to a user: own override, else instance default. */
export function quotaFor(userId: string): ResolvedQuota {
  const row = getSqlite()
    .prepare(`SELECT storage_quota_bytes AS q FROM users WHERE id = ?`)
    .get(userId) as { q?: number | null } | undefined;
  const own = row?.q;
  if (own !== null && own !== undefined) {
    // 0 is a real value meaning "no uploads at all", not "unset".
    return { bytes: Number(own), source: "user" };
  }
  const fallback = getDefaultQuota();
  return fallback === null
    ? { bytes: null, source: "none" }
    : { bytes: fallback, source: "default" };
}

export function setUserQuota(userId: string, bytes: number | null) {
  getSqlite()
    .prepare(`UPDATE users SET storage_quota_bytes = ? WHERE id = ?`)
    .run(bytes === null ? null : Math.floor(bytes), userId);
}

/**
 * Refuse a write that would push the user past their limit.
 *
 * Deliberately checked against the *current* total plus the incoming bytes,
 * so a single oversized upload cannot slip through by being the first one to
 * cross the line. Over-quota users can still read, edit and delete: the limit
 * only stops new bytes, never access to what is already there.
 */
export async function assertQuotaAllows(userId: string, incoming: number) {
  const quota = quotaFor(userId);
  if (quota.bytes === null) return;
  const used = totalOf(await usageFor(userId));
  if (used + incoming > quota.bytes) {
    throw QuotaExceeded(
      `Storage quota exceeded (${used + incoming} > ${quota.bytes} bytes). Free space by deleting snapshots or emptying the trash, or ask an admin to raise the limit.`,
    );
  }
}

/** True when the user is already at or past their limit. */
export async function isOverQuota(userId: string): Promise<boolean> {
  const quota = quotaFor(userId);
  if (quota.bytes === null) return false;
  return totalOf(await usageFor(userId)) >= quota.bytes;
}
