import type { Bookmark, SnapshotStatus } from "@awesome-bookmarks/shared";
import { and, asc, desc, eq, inArray, isNull } from "drizzle-orm";
import { v4 as uuidv4 } from "uuid";
import { openField, sealField } from "../auth/encryption.js";
import { getAutoSnapshots } from "../auth/service.js";
import type { AuthedContext } from "../auth/session.js";
import { getDb } from "../db/client.js";
import { bookmarkTags, bookmarks, folders, tags } from "../db/schema.js";
import { enqueue } from "../jobs/queue.js";
import { BadRequest, NotFound } from "../util/errors.js";
import { sanitizeRichText } from "../util/sanitize.js";
import { urlHash } from "../util/url.js";

interface BookmarkRow {
  id: string;
  folderId: string | null;
  titleCt: Buffer;
  urlCt: Buffer;
  descriptionCt: Buffer | null;
  iconBlobPath: string | null;
  snapshotHtmlPath: string | null;
  snapshotStatus: string;
  snapshotError: string | null;
  position: number;
  createdAt: string;
  updatedAt: string;
}

function decode(
  ctx: AuthedContext,
  row: BookmarkRow,
  tagIds: string[],
): Bookmark {
  return {
    id: row.id,
    folderId: row.folderId,
    title: openField(ctx.dek, ctx.userId, "bookmark.title", row.titleCt),
    url: openField(ctx.dek, ctx.userId, "bookmark.url", row.urlCt),
    description: row.descriptionCt
      ? openField(ctx.dek, ctx.userId, "bookmark.description", row.descriptionCt)
      : null,
    iconBlobPath: row.iconBlobPath,
    snapshotStatus: row.snapshotStatus as SnapshotStatus,
    snapshotError: row.snapshotError,
    hasSnapshot: !!row.snapshotHtmlPath,
    position: row.position,
    tagIds,
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
  };
}

function loadTagIds(bookmarkIds: string[]): Map<string, string[]> {
  const out = new Map<string, string[]>();
  if (bookmarkIds.length === 0) return out;
  const rows = getDb()
    .select()
    .from(bookmarkTags)
    .where(inArray(bookmarkTags.bookmarkId, bookmarkIds))
    .all();
  for (const r of rows) {
    const list = out.get(r.bookmarkId) ?? [];
    list.push(r.tagId);
    out.set(r.bookmarkId, list);
  }
  return out;
}

function ensureFolderExists(ctx: AuthedContext, folderId: string | null) {
  if (!folderId) return;
  const fr = getDb()
    .select({ id: folders.id })
    .from(folders)
    .where(
      and(
        eq(folders.id, folderId),
        eq(folders.userId, ctx.userId),
        isNull(folders.deletedAt),
      ),
    )
    .get();
  if (!fr) throw BadRequest("Folder not found");
}

function ensureTagsExist(ctx: AuthedContext, tagIds: string[]) {
  if (tagIds.length === 0) return;
  const rows = getDb()
    .select({ id: tags.id })
    .from(tags)
    .where(and(eq(tags.userId, ctx.userId), inArray(tags.id, tagIds)))
    .all();
  if (rows.length !== tagIds.length) throw BadRequest("Unknown tag");
}

function nextPosition(ctx: AuthedContext, folderId: string | null): number {
  const rows = getDb()
    .select({ position: bookmarks.position })
    .from(bookmarks)
    .where(
      and(
        eq(bookmarks.userId, ctx.userId),
        folderId === null
          ? isNull(bookmarks.folderId)
          : eq(bookmarks.folderId, folderId),
        isNull(bookmarks.deletedAt),
      ),
    )
    .all();
  return rows.reduce((max, r) => Math.max(max, r.position), -1) + 1;
}

export interface ListFilters {
  folderId?: string;
  tagId?: string;
  q?: string;
  limit?: number;
}

export function listBookmarks(
  ctx: AuthedContext,
  filters: ListFilters,
): Bookmark[] {
  const conds = [
    eq(bookmarks.userId, ctx.userId),
    isNull(bookmarks.deletedAt),
  ];
  if (filters.folderId) conds.push(eq(bookmarks.folderId, filters.folderId));

  // No default limit — return everything by default, which is what makes
  // sense for a self-hosted personal app. Callers can opt into a limit when
  // they want a slice (e.g. search top-N).
  const baseQuery = getDb()
    .select()
    .from(bookmarks)
    .where(and(...conds))
    .orderBy(asc(bookmarks.position), desc(bookmarks.createdAt));
  let rows = filters.limit
    ? baseQuery.limit(filters.limit).all()
    : baseQuery.all();

  if (filters.tagId) {
    const taggedIds = new Set(
      getDb()
        .select({ id: bookmarkTags.bookmarkId })
        .from(bookmarkTags)
        .where(eq(bookmarkTags.tagId, filters.tagId))
        .all()
        .map((r) => r.id),
    );
    rows = rows.filter((r) => taggedIds.has(r.id));
  }

  const tagMap = loadTagIds(rows.map((r) => r.id));
  // Decode per-row; skip (with a warning) any row whose blob fails to
  // decrypt rather than breaking the entire list.
  let result: Bookmark[] = [];
  for (const r of rows) {
    try {
      result.push(
        decode(
          ctx,
          {
            id: r.id,
            folderId: r.folderId,
            titleCt: Buffer.from(r.titleCt),
            urlCt: Buffer.from(r.urlCt),
            descriptionCt: r.descriptionCt ? Buffer.from(r.descriptionCt) : null,
            iconBlobPath: r.iconBlobPath,
            snapshotHtmlPath: r.snapshotHtmlPath,
            snapshotStatus: r.snapshotStatus,
            snapshotError: r.snapshotError,
            position: r.position,
            createdAt: r.createdAt,
            updatedAt: r.updatedAt,
          },
          tagMap.get(r.id) ?? [],
        ),
      );
    } catch (err) {
      console.warn(
        `[bookmarks] skip row ${r.id}: decode failed`,
        err instanceof Error ? err.message : err,
      );
    }
  }

  if (filters.q) {
    const q = filters.q.toLowerCase();
    result = result.filter(
      (b) =>
        b.title.toLowerCase().includes(q) ||
        b.url.toLowerCase().includes(q) ||
        (b.description?.toLowerCase().includes(q) ?? false),
    );
  }

  return result;
}

export function getBookmark(ctx: AuthedContext, id: string): Bookmark {
  const row = getDb()
    .select()
    .from(bookmarks)
    .where(
      and(
        eq(bookmarks.id, id),
        eq(bookmarks.userId, ctx.userId),
        isNull(bookmarks.deletedAt),
      ),
    )
    .get();
  if (!row) throw NotFound("Bookmark not found");
  const tagIds = loadTagIds([id]).get(id) ?? [];
  return decode(
    ctx,
    {
      id: row.id,
      folderId: row.folderId,
      titleCt: Buffer.from(row.titleCt),
      urlCt: Buffer.from(row.urlCt),
      descriptionCt: row.descriptionCt ? Buffer.from(row.descriptionCt) : null,
      iconBlobPath: row.iconBlobPath,
      snapshotHtmlPath: row.snapshotHtmlPath,
      snapshotStatus: row.snapshotStatus,
      snapshotError: row.snapshotError,
      position: row.position,
      createdAt: row.createdAt,
      updatedAt: row.updatedAt,
    },
    tagIds,
  );
}

export function createBookmark(
  ctx: AuthedContext,
  input: {
    folderId?: string | null;
    url: string;
    title?: string;
    description?: string;
    tagIds?: string[];
    fetchSnapshot?: boolean;
  },
): Bookmark {
  const folderId = input.folderId ?? null;
  ensureFolderExists(ctx, folderId);
  const tagIds = input.tagIds ?? [];
  ensureTagsExist(ctx, tagIds);

  const id = uuidv4();
  const title = input.title?.trim() || input.url;
  // The user can opt-out per-bookmark (input.fetchSnapshot=false), but the
  // global pref overrides any "yes" — once auto_snapshots is off, the only
  // way to capture is the manual "Re-snapshot" button.
  const fetch =
    input.fetchSnapshot !== false && getAutoSnapshots(ctx.userId);

  const db = getDb();
  const cleanDescription = sanitizeRichText(input.description ?? null);
  db.insert(bookmarks)
    .values({
      id,
      userId: ctx.userId,
      folderId,
      titleCt: sealField(ctx.dek, ctx.userId, "bookmark.title", title),
      urlCt: sealField(ctx.dek, ctx.userId, "bookmark.url", input.url),
      descriptionCt: cleanDescription
        ? sealField(
            ctx.dek,
            ctx.userId,
            "bookmark.description",
            cleanDescription,
          )
        : null,
      urlHash: urlHash(input.url, ctx.userId),
      snapshotStatus: fetch ? "pending" : "none",
      snapshotError: null,
      position: nextPosition(ctx, folderId),
    })
    .run();

  if (tagIds.length > 0) {
    db.insert(bookmarkTags)
      .values(tagIds.map((t) => ({ bookmarkId: id, tagId: t })))
      .run();
  }

  if (fetch) {
    // Favicon is fast (HTTP fetch only) — enqueue first so the icon shows up
    // in the UI in seconds, even if the heavy snapshot job is queued behind
    // others or fails on a flaky page.
    enqueue({
      userId: ctx.userId,
      type: "favicon",
      payload: { bookmarkId: id },
    });
    enqueue({
      userId: ctx.userId,
      type: "snapshot",
      payload: { bookmarkId: id },
    });
  }

  return getBookmark(ctx, id);
}

export function updateBookmark(
  ctx: AuthedContext,
  id: string,
  input: {
    folderId?: string | null;
    title?: string;
    url?: string;
    description?: string | null;
    tagIds?: string[];
  },
): Bookmark {
  const existing = getBookmark(ctx, id);
  if (input.folderId !== undefined) ensureFolderExists(ctx, input.folderId);

  const update: Record<string, unknown> = {
    updatedAt: new Date().toISOString(),
  };
  if (input.folderId !== undefined) update.folderId = input.folderId;
  if (input.title !== undefined) {
    update.titleCt = sealField(
      ctx.dek,
      ctx.userId,
      "bookmark.title",
      input.title,
    );
  }
  let urlChanged = false;
  if (input.url !== undefined && input.url !== existing.url) {
    update.urlCt = sealField(ctx.dek, ctx.userId, "bookmark.url", input.url);
    update.urlHash = urlHash(input.url, ctx.userId);
    // Only flag the bookmark as "pending" if we're actually going to enqueue
    // a job. Otherwise it would sit in pending forever.
    update.snapshotStatus = getAutoSnapshots(ctx.userId) ? "pending" : "none";
    urlChanged = true;
  }
  if (input.description !== undefined) {
    const clean = sanitizeRichText(input.description);
    update.descriptionCt = clean
      ? sealField(ctx.dek, ctx.userId, "bookmark.description", clean)
      : null;
  }

  getDb().update(bookmarks).set(update).where(eq(bookmarks.id, id)).run();

  if (input.tagIds) {
    ensureTagsExist(ctx, input.tagIds);
    const db = getDb();
    db.delete(bookmarkTags).where(eq(bookmarkTags.bookmarkId, id)).run();
    if (input.tagIds.length > 0) {
      db.insert(bookmarkTags)
        .values(input.tagIds.map((t) => ({ bookmarkId: id, tagId: t })))
        .run();
    }
  }

  if (urlChanged && input.url && getAutoSnapshots(ctx.userId)) {
    enqueue({
      userId: ctx.userId,
      type: "favicon",
      payload: { bookmarkId: id },
    });
    enqueue({
      userId: ctx.userId,
      type: "snapshot",
      payload: { bookmarkId: id },
    });
  }

  return getBookmark(ctx, id);
}

/**
 * Lightweight ownership check that doesn't decode any encrypted field. Used
 * by delete/refresh/icon-set paths so a single corrupted blob can't block
 * basic operations on a bookmark.
 */
function assertBookmarkOwnedAndAlive(ctx: AuthedContext, id: string) {
  const row = getDb()
    .select({ id: bookmarks.id })
    .from(bookmarks)
    .where(
      and(
        eq(bookmarks.id, id),
        eq(bookmarks.userId, ctx.userId),
        isNull(bookmarks.deletedAt),
      ),
    )
    .get();
  if (!row) throw NotFound("Bookmark not found");
}

export function deleteBookmark(ctx: AuthedContext, id: string) {
  assertBookmarkOwnedAndAlive(ctx, id);
  getDb()
    .update(bookmarks)
    .set({ deletedAt: new Date().toISOString() })
    .where(eq(bookmarks.id, id))
    .run();
}

export function refreshSnapshot(ctx: AuthedContext, id: string) {
  assertBookmarkOwnedAndAlive(ctx, id);
  getDb()
    .update(bookmarks)
    .set({ snapshotStatus: "pending", snapshotError: null })
    .where(eq(bookmarks.id, id))
    .run();
  enqueue({
    userId: ctx.userId,
    type: "favicon",
    payload: { bookmarkId: id },
  });
  enqueue({
    userId: ctx.userId,
    type: "snapshot",
    payload: { bookmarkId: id },
  });
}

export function setBookmarkIconPath(
  ctx: AuthedContext,
  id: string,
  path: string,
) {
  assertBookmarkOwnedAndAlive(ctx, id);
  getDb()
    .update(bookmarks)
    .set({ iconBlobPath: path, updatedAt: new Date().toISOString() })
    .where(eq(bookmarks.id, id))
    .run();
}
