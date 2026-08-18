import type {
  Bookmark,
  DuplicateGroup,
  MergeBookmarksResult,
} from "@awesome-bookmarks/shared";
import { and, eq, inArray, isNull } from "drizzle-orm";
import { sealField } from "../auth/encryption.js";
import type { AuthedContext } from "../auth/session.js";
import { getDb, getSqlite } from "../db/client.js";
import { bookmarkTags, bookmarks } from "../db/schema.js";
import { resealSharesForBookmark } from "../groups/resync.js";
import { rebuildPanelsForFolderTree } from "../panels/resync.js";
import { BadRequest, NotFound } from "../util/errors.js";
import { recordVersion } from "../versions/service.js";
import { getBookmark, listBookmarks } from "./service.js";

/**
 * Duplicate detection rides on `url_hash`, which every row already carries: a
 * keyed SHA-256 of the *normalised* URL (see util/url.ts), so trailing
 * slashes, default ports and fragments don't split a group. Grouping therefore
 * costs an index read and never decrypts anything.
 *
 * Symlinks are excluded on purpose. An alias is meant to point at the same URL
 * from a second place, so reporting it as a duplicate would flag the feature
 * working as designed.
 */
export function findDuplicates(ctx: AuthedContext): DuplicateGroup[] {
  const rows = getDb()
    .select({
      id: bookmarks.id,
      urlHash: bookmarks.urlHash,
      aliasOf: bookmarks.aliasOf,
    })
    .from(bookmarks)
    .where(
      and(eq(bookmarks.userId, ctx.userId), isNull(bookmarks.deletedAt)),
    )
    .all();

  const byHash = new Map<string, string[]>();
  for (const r of rows) {
    if (r.aliasOf) continue;
    const list = byHash.get(r.urlHash) ?? [];
    list.push(r.id);
    byHash.set(r.urlHash, list);
  }

  const dupIds = new Set<string>();
  for (const [, ids] of byHash) {
    if (ids.length > 1) for (const id of ids) dupIds.add(id);
  }
  if (dupIds.size === 0) return [];

  // One decrypting pass over the whole list, then filter: cheaper than
  // fetching each duplicate on its own, and it reuses the alias overlay.
  const decoded = new Map(
    listBookmarks(ctx, {})
      .filter((b) => dupIds.has(b.id))
      .map((b) => [b.id, b] as const),
  );

  const groups: DuplicateGroup[] = [];
  for (const [hash, ids] of byHash) {
    if (ids.length < 2) continue;
    const members = ids
      .map((id) => decoded.get(id))
      .filter((b): b is Bookmark => !!b)
      // Oldest first: the original is the natural thing to keep.
      .sort((a, b) => a.createdAt.localeCompare(b.createdAt));
    if (members.length < 2) continue;
    groups.push({ key: hash, url: members[0]!.url, bookmarks: members });
  }

  groups.sort(
    (a, b) => b.bookmarks.length - a.bookmarks.length || a.url.localeCompare(b.url),
  );
  return groups;
}

/**
 * Fold `mergeIds` into `keepId`: the keeper gains every tag, plus any title or
 * description it was missing, and stays starred if any copy was. The absorbed
 * rows go to the trash rather than disappearing, so a merge is reversible.
 */
export function mergeBookmarks(
  ctx: AuthedContext,
  keepId: string,
  mergeIds: string[],
): MergeBookmarksResult {
  const ids = [...new Set(mergeIds)].filter((id) => id !== keepId);
  if (ids.length === 0) throw BadRequest("Nothing to merge");

  const keeper = getBookmark(ctx, keepId);
  const losers = ids.map((id) => getBookmark(ctx, id));

  // Merging rows that point elsewhere would silently destroy a bookmark, so
  // the shared URL is a hard precondition rather than a hint.
  const keeperHash = getDb()
    .select({ urlHash: bookmarks.urlHash })
    .from(bookmarks)
    .where(eq(bookmarks.id, keepId))
    .get()?.urlHash;
  if (!keeperHash) throw NotFound("Bookmark not found");
  for (const id of ids) {
    const h = getDb()
      .select({ urlHash: bookmarks.urlHash })
      .from(bookmarks)
      .where(eq(bookmarks.id, id))
      .get()?.urlHash;
    if (h !== keeperHash) throw BadRequest("Bookmarks point to different URLs");
  }

  const tagIds = new Set(keeper.tagIds);
  for (const l of losers) for (const t of l.tagIds) tagIds.add(t);
  const addedTags = [...tagIds].filter((t) => !keeper.tagIds.includes(t));

  const favorite = keeper.favorite || losers.some((l) => l.favorite);
  const description =
    keeper.description?.trim()
      ? keeper.description
      : (losers.find((l) => l.description?.trim())?.description ?? null);
  // The keeper's title only yields when it is a bare URL, i.e. nothing was
  // ever typed for it.
  const title =
    keeper.title.trim() && keeper.title.trim() !== keeper.url.trim()
      ? keeper.title
      : (losers.find((l) => l.title.trim() && l.title.trim() !== l.url.trim())
          ?.title ?? keeper.title);

  const now = new Date().toISOString();
  let aliasesRepointed = 0;

  const tx = getSqlite().transaction(() => {
    if (addedTags.length > 0) {
      getDb()
        .insert(bookmarkTags)
        .values(addedTags.map((t) => ({ bookmarkId: keepId, tagId: t })))
        .run();
    }
    getDb()
      .update(bookmarks)
      .set({
        favorite,
        rev: keeper.rev + 1,
        updatedAt: now,
        ...(title !== keeper.title
          ? {
              titleCt: sealField(ctx.dek, ctx.userId, "bookmark.title", title),
            }
          : {}),
        ...(description !== keeper.description
          ? {
              descriptionCt: description
                ? sealField(
                    ctx.dek,
                    ctx.userId,
                    "bookmark.description",
                    description,
                  )
                : null,
            }
          : {}),
      })
      .where(eq(bookmarks.id, keepId))
      .run();

    // Symlinks pointing at an absorbed row follow it to the keeper, so a
    // merge never leaves a dangling link behind.
    const res = getDb()
      .update(bookmarks)
      .set({ aliasOf: keepId, updatedAt: now })
      .where(
        and(eq(bookmarks.userId, ctx.userId), inArray(bookmarks.aliasOf, ids)),
      )
      .run();
    aliasesRepointed = Number(res.changes ?? 0);

    getDb()
      .update(bookmarks)
      .set({ deletedAt: now })
      .where(and(eq(bookmarks.userId, ctx.userId), inArray(bookmarks.id, ids)))
      .run();
  });
  tx();

  const after = getBookmark(ctx, keepId);
  recordVersion(ctx, "bookmark", keepId, after.rev, {
    title: after.title,
    url: after.url,
    description: after.description,
    bgColor: after.bgColor ?? null,
    folderId: after.folderId,
    tagIds: after.tagIds,
  });

  // Everything that displayed a merged copy needs to hear about it.
  resealSharesForBookmark(ctx, keepId, after.folderId);
  rebuildPanelsForFolderTree(ctx, after.folderId);
  for (const l of losers) {
    resealSharesForBookmark(ctx, l.id, l.folderId);
    rebuildPanelsForFolderTree(ctx, l.folderId);
  }

  return {
    keptId: keepId,
    merged: ids.length,
    tagsAdded: addedTags.length,
    aliasesRepointed,
  };
}
