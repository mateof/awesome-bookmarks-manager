import type { AdminUser } from "@awesome-bookmarks/shared";
import { and, desc, eq, isNull, sql } from "drizzle-orm";
import type { AuthedContext } from "../auth/session.js";
import { getDb } from "../db/client.js";
import { bookmarks, folders, jobs, users } from "../db/schema.js";
import { deleteUserBlobs } from "../storage/blobs.js";
import { BadRequest, Forbidden, NotFound } from "../util/errors.js";

export function ensureAdmin(ctx: AuthedContext) {
  const row = getDb()
    .select({ role: users.role })
    .from(users)
    .where(eq(users.id, ctx.userId))
    .get();
  if (!row || row.role !== "admin") throw Forbidden("Admin only");
}

export function listAllUsers(ctx: AuthedContext): AdminUser[] {
  ensureAdmin(ctx);
  const rows = getDb()
    .select({
      id: users.id,
      email: users.email,
      role: users.role,
      createdAt: users.createdAt,
    })
    .from(users)
    .all();

  const bookmarkCounts = new Map<string, number>();
  for (const r of getDb()
    .select({
      userId: bookmarks.userId,
      n: sql<number>`count(*)`.as("n"),
    })
    .from(bookmarks)
    .where(isNull(bookmarks.deletedAt))
    .groupBy(bookmarks.userId)
    .all()) {
    bookmarkCounts.set(r.userId, Number(r.n));
  }

  const folderCounts = new Map<string, number>();
  for (const r of getDb()
    .select({
      userId: folders.userId,
      n: sql<number>`count(*)`.as("n"),
    })
    .from(folders)
    .where(isNull(folders.deletedAt))
    .groupBy(folders.userId)
    .all()) {
    folderCounts.set(r.userId, Number(r.n));
  }

  return rows.map((r) => ({
    id: r.id,
    email: r.email,
    role: r.role as AdminUser["role"],
    createdAt: r.createdAt,
    bookmarkCount: bookmarkCounts.get(r.id) ?? 0,
    folderCount: folderCounts.get(r.id) ?? 0,
  }));
}

export async function deleteUser(ctx: AuthedContext, targetId: string) {
  ensureAdmin(ctx);
  if (targetId === ctx.userId) {
    throw BadRequest("Admins cannot delete themselves; use another admin or transfer admin role first");
  }
  const row = getDb().select().from(users).where(eq(users.id, targetId)).get();
  if (!row) throw NotFound("User not found");
  // FKs cascade, so deleting the user removes folders/bookmarks/jobs/etc.
  getDb().delete(users).where(eq(users.id, targetId)).run();
  await deleteUserBlobs(targetId);
}

export interface JobLogEntry {
  id: string;
  type: string;
  status: string;
  attempts: number;
  lastError: string | null;
  availableAt: string;
  startedAt: string | null;
  finishedAt: string | null;
  createdAt: string;
  userId: string;
  userEmail: string;
}

export function listAllJobs(
  ctx: AuthedContext,
  filters: { status?: string; type?: string; limit?: number },
): JobLogEntry[] {
  ensureAdmin(ctx);
  const conds = [] as Parameters<typeof and>;
  if (filters.status) conds.push(eq(jobs.status, filters.status));
  if (filters.type) conds.push(eq(jobs.type, filters.type));
  const where = conds.length > 0 ? and(...conds) : undefined;
  const query = getDb()
    .select({
      id: jobs.id,
      type: jobs.type,
      status: jobs.status,
      attempts: jobs.attempts,
      lastError: jobs.lastError,
      availableAt: jobs.availableAt,
      startedAt: jobs.startedAt,
      finishedAt: jobs.finishedAt,
      createdAt: jobs.createdAt,
      userId: jobs.userId,
      userEmail: users.email,
    })
    .from(jobs)
    .innerJoin(users, eq(users.id, jobs.userId));
  return (where ? query.where(where) : query)
    .orderBy(desc(jobs.createdAt))
    .limit(filters.limit ?? 200)
    .all();
}

/** Bulk-delete jobs by status — useful to purge old errors from imports. */
export function deleteJobsByStatus(
  ctx: AuthedContext,
  status: string,
): { deleted: number } {
  ensureAdmin(ctx);
  const result = getDb().delete(jobs).where(eq(jobs.status, status)).run();
  return { deleted: result.changes ?? 0 };
}

export function setUserRole(
  ctx: AuthedContext,
  targetId: string,
  role: "user" | "admin",
) {
  ensureAdmin(ctx);
  const row = getDb()
    .select({ id: users.id, role: users.role })
    .from(users)
    .where(eq(users.id, targetId))
    .get();
  if (!row) throw NotFound("User not found");
  if (targetId === ctx.userId && role !== "admin") {
    throw BadRequest("You cannot demote yourself; ask another admin");
  }
  getDb()
    .update(users)
    .set({ role, updatedAt: new Date().toISOString() })
    .where(eq(users.id, targetId))
    .run();
}
