import type { JobType } from "@awesome-bookmarks/shared";
import { and, desc, eq, sql } from "drizzle-orm";
import { v4 as uuidv4 } from "uuid";
import { getDb, getSqlite } from "../db/client.js";
import { jobs } from "../db/schema.js";

export interface EnqueueOpts {
  userId: string;
  type: JobType;
  payload: unknown;
  availableAt?: Date;
}

export function enqueue(opts: EnqueueOpts): string {
  const id = uuidv4();
  getDb()
    .insert(jobs)
    .values({
      id,
      userId: opts.userId,
      type: opts.type,
      payload: JSON.stringify(opts.payload),
      status: "pending",
      availableAt: (opts.availableAt ?? new Date()).toISOString(),
    })
    .run();
  return id;
}

export interface ClaimedJob {
  id: string;
  userId: string;
  type: JobType;
  payload: unknown;
  attempts: number;
}

/**
 * Atomic claim: pick the oldest pending job whose available_at has passed and
 * mark it running. Uses better-sqlite3's transactional API for atomicity.
 */
export function claimNext(): ClaimedJob | null {
  const sqlite = getSqlite();
  const tx = sqlite.transaction(() => {
    // We store available_at as ISO 8601 (e.g. "2026-05-02T10:11:51.000Z")
    // but datetime('now') returns SQLite-format ("2026-05-02 10:11:51"),
    // so a raw string compare is broken on same-day jobs ('T' > ' '). Wrap
    // both sides in datetime() so SQLite normalises them to the same form.
    const row = sqlite
      .prepare(
        `SELECT id, user_id, type, payload, attempts FROM jobs
         WHERE status = 'pending'
           AND datetime(available_at) <= datetime('now')
         ORDER BY datetime(available_at) ASC
         LIMIT 1`,
      )
      .get() as
      | {
          id: string;
          user_id: string;
          type: string;
          payload: string;
          attempts: number;
        }
      | undefined;
    if (!row) return null;
    sqlite
      .prepare(
        `UPDATE jobs SET status = 'running', started_at = datetime('now'),
                          attempts = attempts + 1
         WHERE id = ? AND status = 'pending'`,
      )
      .run(row.id);
    return {
      id: row.id,
      userId: row.user_id,
      type: row.type as JobType,
      payload: JSON.parse(row.payload),
      attempts: row.attempts + 1,
    };
  });
  return tx() as ClaimedJob | null;
}

export function complete(id: string) {
  getDb()
    .update(jobs)
    .set({
      status: "done",
      finishedAt: sql`current_timestamp`,
    })
    .where(eq(jobs.id, id))
    .run();
}

const RETRY_DELAYS_MIN = [1, 5, 30, 120];

/**
 * Mark a job as permanently failed without scheduling retries — used for
 * errors that won't recover on their own (DNS NXDOMAIN, refused connection,
 * invalid TLS cert, malformed URL).
 */
export function failTerminal(id: string, error: string) {
  getDb()
    .update(jobs)
    .set({
      status: "error",
      lastError: error,
      finishedAt: sql`current_timestamp`,
    })
    .where(eq(jobs.id, id))
    .run();
}

export function fail(id: string, error: string) {
  const row = getDb()
    .select({ attempts: jobs.attempts })
    .from(jobs)
    .where(eq(jobs.id, id))
    .get();
  const attempts = row?.attempts ?? 0;
  if (attempts >= RETRY_DELAYS_MIN.length) {
    getDb()
      .update(jobs)
      .set({
        status: "error",
        lastError: error,
        finishedAt: sql`current_timestamp`,
      })
      .where(eq(jobs.id, id))
      .run();
    return;
  }
  const delayMin = RETRY_DELAYS_MIN[attempts] ?? 60;
  const next = new Date(Date.now() + delayMin * 60_000);
  getDb()
    .update(jobs)
    .set({
      status: "pending",
      lastError: error,
      availableAt: next.toISOString(),
      startedAt: null,
    })
    .where(eq(jobs.id, id))
    .run();
}

export function deferForUserKey(id: string) {
  getDb()
    .update(jobs)
    .set({ status: "pending_user_key", startedAt: null })
    .where(eq(jobs.id, id))
    .run();
}

/** Re-arm any jobs marked pending_user_key for this user (called on login). */
export function reawakenForUser(userId: string) {
  getDb()
    .update(jobs)
    .set({
      status: "pending",
      availableAt: sql`current_timestamp`,
    })
    .where(and(eq(jobs.userId, userId), eq(jobs.status, "pending_user_key")))
    .run();
}

export function listUserJobs(userId: string) {
  return getDb()
    .select()
    .from(jobs)
    .where(eq(jobs.userId, userId))
    .orderBy(desc(jobs.createdAt))
    .limit(100)
    .all();
}

export function pendingDue(): boolean {
  const row = getSqlite()
    .prepare(
      `SELECT id FROM jobs
       WHERE status = 'pending'
         AND datetime(available_at) <= datetime('now')
       LIMIT 1`,
    )
    .get();
  return !!row;
}
