import type { Bookmark, SnapshotStatus } from "@awesome-bookmarks/shared";
import { and, asc, desc, eq, inArray, isNull } from "drizzle-orm";
import { v4 as uuidv4 } from "uuid";
import { groupOfFolder } from "../folders/service.js";
import {
  assertCanWrite,
  canWriteRow,
  openRowField,
  sealRowField,
  visibleTo,
} from "../groups/scope.js";
import { getAutoSnapshots } from "../auth/service.js";
import type { AuthedContext } from "../auth/session.js";
import { getDb, getSqlite } from "../db/client.js";
import { cachedBookmarks, invalidate } from "../db/decoded-cache.js";
import { bookmarkTags, bookmarks, folders, tags } from "../db/schema.js";
import {
  resealSharesForBookmark,
  resealSharesForFolderTree,
} from "../groups/resync.js";
import { rebuildPanelsForFolderTree } from "../panels/resync.js";
import { enqueue } from "../jobs/queue.js";
import { BadRequest, Conflict, NotFound } from "../util/errors.js";
import { sanitizeRichText } from "../util/sanitize.js";
import { urlHash } from "../util/url.js";
import { type BookmarkSnapshot, recordVersion } from "../versions/service.js";

function bookmarkSnapshot(b: Bookmark): BookmarkSnapshot {
  return {
    title: b.title,
    url: b.url,
    description: b.description,
    bgColor: b.bgColor ?? null,
    folderId: b.folderId,
    tagIds: b.tagIds,
  };
}

interface BookmarkRow {
  id: string;
  userId: string;
  /** Legacy: sealed with a group's own key. */
  keyGroupId: string | null;
  /** Sealed with a scope key, which any number of groups may hold. */
  keyScopeId: string | null;
  folderId: string | null;
  titleCt: Buffer;
  urlCt: Buffer;
  descriptionCt: Buffer | null;
  iconBlobPath: string | null;
  imageBlobPath: string | null;
  bgColor: string | null;
  textTone: string | null;
  shareOrigin: string | null;
  favorite: boolean;
  aliasOf: string | null;
  snapshotHtmlPath: string | null;
  snapshotStatus: string;
  snapshotError: string | null;
  position: number;
  rev: number;
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
    keyGroupId: row.keyGroupId,
    keyScopeId: row.keyScopeId,
    shared: !!(row.keyGroupId || row.keyScopeId),
    canWrite: canWriteRow(ctx, row),
    mine: row.userId === ctx.userId,
    folderId: row.folderId,
    title: openRowField(ctx, row, "bookmark.title", row.titleCt),
    url: openRowField(ctx, row, "bookmark.url", row.urlCt),
    description: row.descriptionCt
      ? openRowField(ctx, row, "bookmark.description", row.descriptionCt)
      : null,
    iconBlobPath: row.iconBlobPath,
    imageBlobPath: row.imageBlobPath,
    bgColor: row.bgColor,
    textTone: (row.textTone as Bookmark["textTone"]) ?? null,
    shareOrigin: row.shareOrigin,
    favorite: row.favorite,
    aliasOf: row.aliasOf,
    snapshotStatus: row.snapshotStatus as SnapshotStatus,
    snapshotError: row.snapshotError,
    hasSnapshot: !!row.snapshotHtmlPath,
    position: row.position,
    rev: row.rev,
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
    .select({ id: folders.id, linkedShareId: folders.linkedShareId })
    .from(folders)
    .where(
      and(
        eq(folders.id, folderId),
        // A folder the group owns counts: putting a bookmark into a shared
        // folder is the ordinary thing an editor does.
        visibleTo(ctx, folders),
        isNull(folders.deletedAt),
      ),
    )
    .get();
  if (!fr) throw BadRequest("Folder not found");
  // A linked-share portal mirrors the live share; it holds no real bookmarks.
  if (fr.linkedShareId) throw BadRequest("Cannot add into a linked folder");
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
        visibleTo(ctx, bookmarks),
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
  /** Only starred bookmarks. */
  favorite?: boolean;
}

/**
 * Every bookmark of a user, decrypted, in `position ASC, createdAt DESC` order.
 *
 * Cached in process because the decryption, not the query, is what costs: on
 * 20.000 bookmarks the rows come out of SQLite in ~48 ms and opening their
 * three sealed fields takes ~193 ms. See db/decoded-cache.ts for how the entry
 * proves it is still current.
 */
function allBookmarks(ctx: AuthedContext): Bookmark[] {
  return cachedBookmarks(ctx.userId, () => decodeAllBookmarks(ctx));
}

export function listBookmarks(
  ctx: AuthedContext,
  filters: ListFilters,
): Bookmark[] {
  // Filters run over the cached list in the same order the SQL used to apply
  // them (folder/favourite, then limit, then tag, then text), so the results
  // are identical to before — `limit` still bites before the tag filter.
  const all = allBookmarks(ctx);
  let result = all;

  if (filters.folderId) {
    result = result.filter((b) => b.folderId === filters.folderId);
  }
  if (filters.favorite) result = result.filter((b) => b.favorite);
  if (filters.limit) result = result.slice(0, filters.limit);
  if (filters.tagId) {
    result = result.filter((b) => b.tagIds.includes(filters.tagId!));
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

  // Never hand out the cached array itself: every filter above already builds
  // a new one, but the unfiltered call would otherwise share it, and a single
  // in-place sort or splice anywhere would corrupt it for every later reader.
  return result === all ? all.slice() : result;
}

/** The uncached path: read every row and open every sealed field. */
function decodeAllBookmarks(ctx: AuthedContext): Bookmark[] {
  const rows = getDb()
    .select()
    .from(bookmarks)
    .where(
      and(visibleTo(ctx, bookmarks), isNull(bookmarks.deletedAt)),
    )
    .orderBy(asc(bookmarks.position), desc(bookmarks.createdAt))
    .all();

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
            userId: r.userId,
            keyGroupId: r.keyGroupId ?? null,
            keyScopeId: r.keyScopeId ?? null,
            folderId: r.folderId,
            titleCt: Buffer.from(r.titleCt),
            urlCt: Buffer.from(r.urlCt),
            descriptionCt: r.descriptionCt ? Buffer.from(r.descriptionCt) : null,
            iconBlobPath: r.iconBlobPath,
            imageBlobPath: r.imageBlobPath,
            bgColor: r.bgColor,
            textTone: r.textTone,
            shareOrigin: r.shareOrigin,
            favorite: r.favorite,
            aliasOf: r.aliasOf,
            snapshotHtmlPath: r.snapshotHtmlPath,
            snapshotStatus: r.snapshotStatus,
            snapshotError: r.snapshotError,
            position: r.position,
            rev: r.rev,
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

  // Resolved against the whole list rather than a page of it, so a symlink
  // whose target sits outside the current slice still renders from memory
  // instead of triggering a lookup per alias.
  return applyBookmarkAliases(ctx, result);
}

/**
 * Alias rows mirror another bookmark: overlay the target's live fields. When a
 * target is outside the current page (e.g. listing a single folder) it is
 * fetched on demand.
 */
function applyBookmarkAliases(ctx: AuthedContext, list: Bookmark[]): Bookmark[] {
  const aliases = list.filter((b) => b.aliasOf);
  if (aliases.length === 0) return list;
  const byId = new Map(list.map((b) => [b.id, b]));
  for (const a of aliases) {
    if (byId.has(a.aliasOf!)) continue;
    try {
      byId.set(a.aliasOf!, getBookmark(ctx, a.aliasOf!));
    } catch {
      /* dangling link: fall back to the stored placeholder */
    }
  }
  return list.map((b) => {
    if (!b.aliasOf) return b;
    const target = byId.get(b.aliasOf);
    if (!target) return b;
    return {
      ...b,
      title: target.title,
      url: target.url,
      description: target.description,
      iconBlobPath: target.iconBlobPath,
      imageBlobPath: target.imageBlobPath,
      bgColor: target.bgColor,
      tagIds: target.tagIds,
      snapshotStatus: target.snapshotStatus,
      hasSnapshot: target.hasSnapshot,
    };
  });
}

export function getBookmark(ctx: AuthedContext, id: string): Bookmark {
  const row = getDb()
    .select()
    .from(bookmarks)
    .where(
      and(
        eq(bookmarks.id, id),
        visibleTo(ctx, bookmarks),
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
      userId: row.userId,
      keyGroupId: row.keyGroupId ?? null,
      keyScopeId: row.keyScopeId ?? null,
      folderId: row.folderId,
      titleCt: Buffer.from(row.titleCt),
      urlCt: Buffer.from(row.urlCt),
      descriptionCt: row.descriptionCt ? Buffer.from(row.descriptionCt) : null,
      iconBlobPath: row.iconBlobPath,
      imageBlobPath: row.imageBlobPath,
      bgColor: row.bgColor,
      textTone: row.textTone,
      shareOrigin: row.shareOrigin,
      favorite: row.favorite,
      aliasOf: row.aliasOf,
      snapshotHtmlPath: row.snapshotHtmlPath,
      snapshotStatus: row.snapshotStatus,
      snapshotError: row.snapshotError,
      position: row.position,
      rev: row.rev,
      createdAt: row.createdAt,
      updatedAt: row.updatedAt,
    },
    tagIds,
  );
}

export function createBookmark(
  ctx: AuthedContext,
  input: {
    /** See createFolder: the share write-back reuses the id the member's
     * change already put in the shared payload. */
    id?: string;
    folderId?: string | null;
    url: string;
    title?: string;
    description?: string;
    tagIds?: string[];
    bgColor?: string | null;
    textTone?: string | null;
    favorite?: boolean;
    fetchSnapshot?: boolean;
    shareOrigin?: string | null;
  },
): Bookmark {
  const folderId = input.folderId ?? null;
  ensureFolderExists(ctx, folderId);
  const tagIds = input.tagIds ?? [];
  ensureTagsExist(ctx, tagIds);

  const id = input.id ?? uuidv4();
  const title = input.title?.trim() || input.url;
  // The user can opt-out per-bookmark (input.fetchSnapshot=false), but the
  // global pref overrides any "yes" — once auto_snapshots is off, the only
  // way to capture is the manual "Re-snapshot" button.
  const fetch =
    input.fetchSnapshot !== false && getAutoSnapshots(ctx.userId);

  const db = getDb();
  const cleanDescription = sanitizeRichText(input.description ?? null);
  // Inherits the folder's key, so a bookmark created inside a shared folder is
  // readable by the group from the moment it exists.
  const inherited = folderId
    ? groupOfFolder(ctx, folderId)
    : { keyGroupId: null, keyScopeId: null };
  const keyed = { userId: ctx.userId, ...inherited };
  if (inherited.keyGroupId || inherited.keyScopeId) assertCanWrite(ctx, keyed);
  db.insert(bookmarks)
    .values({
      id,
      userId: ctx.userId,
      keyGroupId: inherited.keyGroupId,
      keyScopeId: inherited.keyScopeId,
      folderId,
      titleCt: sealRowField(ctx, keyed, "bookmark.title", title),
      urlCt: sealRowField(ctx, keyed, "bookmark.url", input.url),
      descriptionCt: cleanDescription
        ? sealRowField(ctx, keyed, "bookmark.description", cleanDescription)
        : null,
      urlHash: urlHash(input.url, ctx.userId),
      bgColor: input.bgColor ?? null,
      textTone: input.textTone ?? null,
      shareOrigin: input.shareOrigin ?? null,
      favorite: input.favorite ?? false,
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

  const saved = getBookmark(ctx, id);
  recordVersion(ctx, "bookmark", id, saved.rev, bookmarkSnapshot(saved));
  // A new bookmark inside a shared folder must reach members.
  resealSharesForBookmark(ctx, id, saved.folderId);
  rebuildPanelsForFolderTree(ctx, saved.folderId);
  return saved;
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
    bgColor?: string | null;
    textTone?: "auto" | "light" | "dark" | null;
    favorite?: boolean;
    /** Optimistic concurrency: reject with 409 if the row no longer has it. */
    baseRev?: number;
  },
): Bookmark {
  const existing = getBookmark(ctx, id);
  if (input.folderId !== undefined) ensureFolderExists(ctx, input.folderId);
  const keyed = {
    userId: ctx.userId,
    keyGroupId: existing.keyGroupId ?? null,
    keyScopeId: existing.keyScopeId ?? null,
  };
  assertCanWrite(ctx, keyed);
  if (input.tagIds) ensureTagsExist(ctx, input.tagIds);

  const update: Record<string, unknown> = {
    updatedAt: new Date().toISOString(),
    rev: existing.rev + 1,
  };
  if (input.folderId !== undefined) update.folderId = input.folderId;
  if (input.title !== undefined) {
    update.titleCt = sealRowField(ctx, keyed, "bookmark.title", input.title);
  }
  let urlChanged = false;
  if (input.url !== undefined && input.url !== existing.url) {
    update.urlCt = sealRowField(ctx, keyed, "bookmark.url", input.url);
    update.urlHash = urlHash(input.url, ctx.userId);
    // Only flag the bookmark as "pending" if we're actually going to enqueue
    // a job. Otherwise it would sit in pending forever.
    update.snapshotStatus = getAutoSnapshots(ctx.userId) ? "pending" : "none";
    urlChanged = true;
  }
  if (input.description !== undefined) {
    const clean = sanitizeRichText(input.description);
    update.descriptionCt = clean
      ? sealRowField(ctx, keyed, "bookmark.description", clean)
      : null;
  }
  if (input.textTone !== undefined) {
    // "auto" is stored as NULL: the absence of an override, not a third value
    // to reason about everywhere it is read.
    update.textTone = input.textTone === "auto" ? null : input.textTone;
  }
  if (input.bgColor !== undefined) {
    update.bgColor = input.bgColor;
    // Picking a colour drops any background image (and vice versa).
    if (input.bgColor) update.imageBlobPath = null;
  }
  if (input.favorite !== undefined) {
    update.favorite = input.favorite;
  }

  const where =
    input.baseRev !== undefined
      ? and(eq(bookmarks.id, id), eq(bookmarks.rev, input.baseRev))
      : eq(bookmarks.id, id);

  const tx = getSqlite().transaction(() => {
    const res = getDb().update(bookmarks).set(update).where(where).run();
    if (input.baseRev !== undefined && res.changes === 0) {
      throw Conflict("stale_write");
    }
    if (input.tagIds) {
      const db = getDb();
      db.delete(bookmarkTags).where(eq(bookmarkTags.bookmarkId, id)).run();
      if (input.tagIds.length > 0) {
        db.insert(bookmarkTags)
          .values(input.tagIds.map((t) => ({ bookmarkId: id, tagId: t })))
          .run();
      }
    }
  });
  tx();

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

  const saved = getBookmark(ctx, id);
  recordVersion(ctx, "bookmark", id, saved.rev, bookmarkSnapshot(saved));
  // Reflect edits (title/url/description) to members; also cover the old
  // folder if the bookmark was moved out of a shared subtree.
  resealSharesForBookmark(ctx, id, saved.folderId);
  rebuildPanelsForFolderTree(ctx, saved.folderId);
  if (input.folderId !== undefined && existing.folderId !== saved.folderId) {
    resealSharesForFolderTree(ctx, existing.folderId);
    rebuildPanelsForFolderTree(ctx, existing.folderId);
  }
  return saved;
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
        visibleTo(ctx, bookmarks),
        isNull(bookmarks.deletedAt),
      ),
    )
    .get();
  if (!row) throw NotFound("Bookmark not found");
}

export function moveBookmark(
  ctx: AuthedContext,
  id: string,
  newFolderId: string | null,
  position: number,
) {
  assertBookmarkOwnedAndAlive(ctx, id);
  if (newFolderId) ensureFolderExists(ctx, newFolderId);
  const oldFolderId =
    getDb()
      .select({ folderId: bookmarks.folderId })
      .from(bookmarks)
      .where(eq(bookmarks.id, id))
      .get()?.folderId ?? null;
  getDb()
    .update(bookmarks)
    .set({
      folderId: newFolderId,
      position,
      updatedAt: new Date().toISOString(),
    })
    .where(eq(bookmarks.id, id))
    .run();
  // A move rewrites the row without bumping `rev`, which is the one mutation
  // the decoded-cache signature could miss if two landed in the same
  // millisecond. Cheap to be explicit here.
  invalidate(ctx.userId);
  // Moving in or out of a shared folder changes what members should see.
  resealSharesForBookmark(ctx, id, newFolderId);
  rebuildPanelsForFolderTree(ctx, newFolderId);
  resealSharesForFolderTree(ctx, oldFolderId);
  rebuildPanelsForFolderTree(ctx, oldFolderId);
}

export function deleteBookmark(ctx: AuthedContext, id: string) {
  assertBookmarkOwnedAndAlive(ctx, id);
  const folderId =
    getDb()
      .select({ folderId: bookmarks.folderId })
      .from(bookmarks)
      .where(eq(bookmarks.id, id))
      .get()?.folderId ?? null;
  getDb()
    .update(bookmarks)
    .set({ deletedAt: new Date().toISOString() })
    .where(eq(bookmarks.id, id))
    .run();
  // The removal must reach members of a share covering this bookmark.
  resealSharesForBookmark(ctx, id, folderId);
  rebuildPanelsForFolderTree(ctx, folderId);
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

export function setBookmarkBgImagePath(
  ctx: AuthedContext,
  id: string,
  path: string | null,
) {
  assertBookmarkOwnedAndAlive(ctx, id);
  getDb()
    .update(bookmarks)
    // Colour and image are mutually exclusive: setting one clears the other.
    .set({
      imageBlobPath: path,
      ...(path ? { bgColor: null } : {}),
      updatedAt: new Date().toISOString(),
    })
    .where(eq(bookmarks.id, id))
    .run();
}
