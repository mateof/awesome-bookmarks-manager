import { type ApplyTagsResult, pickTagColor } from "@awesome-bookmarks/shared";
import { getFolder, updateFolder } from "../folders/service.js";
import {
  listSmartFolders,
  updateSmartFolder,
} from "../smart-folders/service.js";
import { getBookmark, updateBookmark } from "../bookmarks/service.js";
import type { Tag } from "@awesome-bookmarks/shared";
import { and, asc, count, eq, inArray, isNull } from "drizzle-orm";
import { v4 as uuidv4 } from "uuid";
import type { AuthedContext } from "../auth/session.js";
import { getDb } from "../db/client.js";
import { invalidate } from "../db/decoded-cache.js";
import {
  bookmarkTags,
  bookmarks,
  folderTags,
  folders,
  tags,
} from "../db/schema.js";
import { visibleTo } from "../groups/scope.js";
import { Conflict, NotFound } from "../util/errors.js";

/**
 * Every tag, with how much wears it.
 *
 * The counts are done here, with two `GROUP BY` over the join tables, because
 * the alternative is what the screens used to do: download the whole library
 * and count in the browser, which means decrypting every bookmark you own to
 * draw a list of names. Nothing here touches ciphertext at all.
 *
 * The visibility rule is the same one the folder and bookmark lists use, so
 * the numbers keep meaning "of what you can see", shared content included.
 * Trashed items do not count: they are not gone, but they are not there.
 */
export function listTags(ctx: AuthedContext): Tag[] {
  const db = getDb();
  const rows = db
    .select({ id: tags.id, name: tags.name, color: tags.color })
    .from(tags)
    .where(eq(tags.userId, ctx.userId))
    .orderBy(asc(tags.name))
    .all();

  const folderCounts = new Map(
    db
      .select({ tagId: folderTags.tagId, n: count() })
      .from(folderTags)
      .innerJoin(folders, eq(folders.id, folderTags.folderId))
      .where(and(visibleTo(ctx, folders), isNull(folders.deletedAt)))
      .groupBy(folderTags.tagId)
      .all()
      .map((r) => [r.tagId, r.n] as const),
  );
  const bookmarkCounts = new Map(
    db
      .select({ tagId: bookmarkTags.tagId, n: count() })
      .from(bookmarkTags)
      .innerJoin(bookmarks, eq(bookmarks.id, bookmarkTags.bookmarkId))
      .where(and(visibleTo(ctx, bookmarks), isNull(bookmarks.deletedAt)))
      .groupBy(bookmarkTags.tagId)
      .all()
      .map((r) => [r.tagId, r.n] as const),
  );

  return rows.map((r) => ({
    ...r,
    folderCount: folderCounts.get(r.id) ?? 0,
    bookmarkCount: bookmarkCounts.get(r.id) ?? 0,
  }));
}

export function createTag(
  ctx: AuthedContext,
  input: { name: string; color?: string },
): Tag {
  // Chosen here rather than by the caller: this is the only place that can see
  // every tag this user already has, which is what "a colour nothing else is
  // using" needs. A client picking from its own cached list gets it wrong the
  // moment two tags are created in a row.
  const color = input.color ?? pickTagColor(listTags(ctx));
  const existing = getDb()
    .select({ id: tags.id })
    .from(tags)
    .where(and(eq(tags.userId, ctx.userId), eq(tags.name, input.name)))
    .get();
  if (existing) throw Conflict("Tag with that name already exists");

  const id = uuidv4();
  getDb()
    .insert(tags)
    .values({ id, userId: ctx.userId, name: input.name, color })
    .run();
  return { id, name: input.name, color };
}

export function updateTag(
  ctx: AuthedContext,
  id: string,
  input: { name?: string; color?: string },
): Tag {
  const row = getDb()
    .select()
    .from(tags)
    .where(and(eq(tags.id, id), eq(tags.userId, ctx.userId)))
    .get();
  if (!row) throw NotFound("Tag not found");

  if (input.name !== undefined && input.name !== row.name) {
    const conflict = getDb()
      .select({ id: tags.id })
      .from(tags)
      .where(and(eq(tags.userId, ctx.userId), eq(tags.name, input.name)))
      .get();
    if (conflict) throw Conflict("Tag with that name already exists");
  }

  const update: Record<string, string> = {};
  if (input.name !== undefined) update.name = input.name;
  if (input.color !== undefined) update.color = input.color;
  if (Object.keys(update).length > 0) {
    getDb().update(tags).set(update).where(eq(tags.id, id)).run();
  }
  return {
    id,
    name: input.name ?? row.name,
    color: input.color ?? row.color,
  };
}

export function deleteTag(ctx: AuthedContext, id: string) {
  const row = getDb()
    .select({ id: tags.id })
    .from(tags)
    .where(and(eq(tags.id, id), eq(tags.userId, ctx.userId)))
    .get();
  if (!row) throw NotFound("Tag not found");
  removeTags(ctx, [id]);
}

/**
 * Delete several, and take their join rows with them.
 *
 * Deleting only the `tags` row left `folder_tags` and `bookmark_tags` pointing
 * at a tag that no longer exists. Nothing showed it, because the screens drop
 * ids they cannot resolve to a name, so the rows just accumulated for as long
 * as the account lived. They also make the counts here wrong the moment a new
 * tag reuses the id, which is exactly the kind of bug nobody would find.
 */
export function removeTags(ctx: AuthedContext, ids: string[]): number {
  if (ids.length === 0) return 0;
  const db = getDb();
  const mine = db
    .select({ id: tags.id })
    .from(tags)
    .where(and(eq(tags.userId, ctx.userId), inArray(tags.id, ids)))
    .all()
    .map((r) => r.id);
  if (mine.length === 0) return 0;
  db.transaction(() => {
    db.delete(folderTags).where(inArray(folderTags.tagId, mine)).run();
    db.delete(bookmarkTags).where(inArray(bookmarkTags.tagId, mine)).run();
    db.delete(tags).where(inArray(tags.id, mine)).run();
  });
  // The folder and bookmark lists are served from a decrypted cache, and their
  // `tagIds` come straight from the join rows just deleted. Without this the
  // API keeps handing out a tag id that resolves to nothing.
  invalidate(ctx.userId);
  return mine.length;
}

/**
 * Fold `id` into `into`: everything wearing the first ends up wearing the
 * second, and the first stops existing.
 *
 * Insert-then-delete rather than an update of the join rows, because an item
 * may already carry both tags and the pair is the primary key: updating would
 * hit a constraint on precisely the rows that matter most, the ones where the
 * two tags overlap.
 *
 * Smart folders are rewritten too. Their query is a sealed blob holding tag
 * ids, so a merge that ignored them would leave a saved filter pointing at a
 * tag that no longer exists, silently returning nothing.
 */
export function mergeTags(
  ctx: AuthedContext,
  id: string,
  into: string,
): { folders: number; bookmarks: number; smartFolders: number } {
  if (id === into) throw Conflict("A tag cannot be merged into itself");
  const db = getDb();
  const both = db
    .select({ id: tags.id })
    .from(tags)
    .where(and(eq(tags.userId, ctx.userId), inArray(tags.id, [id, into])))
    .all();
  if (both.length !== 2) throw NotFound("Tag not found");

  let movedFolders = 0;
  let movedBookmarks = 0;
  db.transaction(() => {
    const folderIds = db
      .select({ folderId: folderTags.folderId })
      .from(folderTags)
      .where(eq(folderTags.tagId, id))
      .all()
      .map((r) => r.folderId);
    const already = new Set(
      db
        .select({ folderId: folderTags.folderId })
        .from(folderTags)
        .where(eq(folderTags.tagId, into))
        .all()
        .map((r) => r.folderId),
    );
    for (const folderId of folderIds) {
      if (already.has(folderId)) continue;
      db.insert(folderTags).values({ folderId, tagId: into }).run();
      movedFolders++;
    }

    const bookmarkIds = db
      .select({ bookmarkId: bookmarkTags.bookmarkId })
      .from(bookmarkTags)
      .where(eq(bookmarkTags.tagId, id))
      .all()
      .map((r) => r.bookmarkId);
    const alreadyB = new Set(
      db
        .select({ bookmarkId: bookmarkTags.bookmarkId })
        .from(bookmarkTags)
        .where(eq(bookmarkTags.tagId, into))
        .all()
        .map((r) => r.bookmarkId),
    );
    for (const bookmarkId of bookmarkIds) {
      if (alreadyB.has(bookmarkId)) continue;
      db.insert(bookmarkTags).values({ bookmarkId, tagId: into }).run();
      movedBookmarks++;
    }

    db.delete(folderTags).where(eq(folderTags.tagId, id)).run();
    db.delete(bookmarkTags).where(eq(bookmarkTags.tagId, id)).run();
    db.delete(tags).where(eq(tags.id, id)).run();
  });
  invalidate(ctx.userId);

  const smartFolders = rewriteSmartFolderTags(ctx, id, into);
  return { folders: movedFolders, bookmarks: movedBookmarks, smartFolders };
}

/**
 * Saved filters that named the tag being folded away now name the survivor.
 *
 * Done through the smart-folder service rather than with SQL: the query is a
 * sealed blob, so there is no way to rewrite it without opening it, and the
 * one place that knows how is the service that owns it.
 */
function rewriteSmartFolderTags(
  ctx: AuthedContext,
  from: string,
  into: string,
): number {
  let touched = 0;
  for (const sf of listSmartFolders(ctx)) {
    if (!sf.query.tagIds.includes(from)) continue;
    const tagIds = [...new Set(sf.query.tagIds.map((t) => (t === from ? into : t)))];
    updateSmartFolder(ctx, sf.id, { query: { ...sf.query, tagIds } });
    touched++;
  }
  return touched;
}

/**
 * Add tags to many folders and bookmarks in one call.
 *
 * Deliberately goes through `updateFolder` / `updateBookmark` rather than
 * writing the join rows directly. Those carry the write permission check, the
 * revision bump and the version history, and a bulk path that reimplemented
 * them would be a second place for the rules to drift out of step — which in
 * this codebase has already happened once, with the jobs that opened rows using
 * the wrong key.
 *
 * An item the caller cannot write is counted and skipped rather than failing
 * the batch: a selection that happens to include one read-only shared folder
 * should still tag the other forty.
 */
export function applyTags(
  ctx: AuthedContext,
  input: { folderIds: string[]; bookmarkIds: string[]; tagIds: string[] },
): ApplyTagsResult {
  let folders = 0;
  let bookmarks = 0;
  let skipped = 0;

  for (const id of input.folderIds) {
    try {
      const current = getFolder(ctx, id);
      const next = union(current.tagIds ?? [], input.tagIds);
      // Nothing new on this one: skip the write rather than bump a revision
      // and record a version that says nothing changed.
      if (next.length === (current.tagIds ?? []).length) continue;
      updateFolder(ctx, id, { tagIds: next });
      folders++;
    } catch {
      skipped++;
    }
  }

  for (const id of input.bookmarkIds) {
    try {
      const current = getBookmark(ctx, id);
      const next = union(current.tagIds ?? [], input.tagIds);
      if (next.length === (current.tagIds ?? []).length) continue;
      updateBookmark(ctx, id, { tagIds: next });
      bookmarks++;
    } catch {
      skipped++;
    }
  }

  return { folders, bookmarks, skipped };
}

function union(current: string[], adding: string[]): string[] {
  const out = new Set(current);
  for (const id of adding) out.add(id);
  return [...out];
}
