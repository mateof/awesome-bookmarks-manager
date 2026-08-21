import type { TrashItem } from "@awesome-bookmarks/shared";
import { and, eq, inArray, isNotNull } from "drizzle-orm";
import { openField } from "../auth/encryption.js";
import type { AuthedContext } from "../auth/session.js";
import { getDb, getSqlite } from "../db/client.js";
import {
  bookmarkTags,
  bookmarks,
  entityVersions,
  folderTags,
  folders,
} from "../db/schema.js";
import { resealSharesForFolderTree } from "../groups/resync.js";
import { rebuildPanelsForFolderTree } from "../panels/resync.js";
import { deleteSnapshotIndex } from "../search/service.js";
import { deleteBlob } from "../storage/blobs.js";
import { purgeAttachmentsFor } from "../attachments/service.js";
import { NotFound } from "../util/errors.js";

/**
 * Every delete in the app is soft: the row keeps its ciphertext and gets a
 * `deleted_at` stamp. This module is the other half of that decision — the
 * place where a delete can be walked back.
 *
 * Nothing here expires on its own. Auto-purging would silently destroy data
 * that survives today, so emptying the trash is always an explicit action.
 */

interface FolderMeta {
  id: string;
  parentId: string | null;
  name: string;
  deletedAt: string | null;
}

/** Decode every folder row (deleted included) so paths can be rebuilt. */
function allFolderMeta(ctx: AuthedContext): Map<string, FolderMeta> {
  const rows = getDb()
    .select({
      id: folders.id,
      parentId: folders.parentId,
      nameCt: folders.nameCt,
      deletedAt: folders.deletedAt,
    })
    .from(folders)
    .where(eq(folders.userId, ctx.userId))
    .all();
  const out = new Map<string, FolderMeta>();
  for (const r of rows) {
    let name = "?";
    try {
      name = openField(
        ctx.dek,
        ctx.userId,
        "folder.name",
        Buffer.from(r.nameCt),
      );
    } catch {
      /* undecodable row still contributes structure, just not a label */
    }
    out.set(r.id, {
      id: r.id,
      parentId: r.parentId,
      name,
      deletedAt: r.deletedAt,
    });
  }
  return out;
}

function pathOf(
  meta: Map<string, FolderMeta>,
  folderId: string | null,
  rootLabel: string,
): string {
  const parts: string[] = [];
  let cur = folderId;
  const seen = new Set<string>();
  while (cur && !seen.has(cur)) {
    seen.add(cur);
    const f = meta.get(cur);
    if (!f) break;
    parts.unshift(f.name);
    cur = f.parentId;
  }
  return parts.length > 0 ? parts.join(" / ") : rootLabel;
}

export function listTrash(
  ctx: AuthedContext,
  rootLabel = "/",
): TrashItem[] {
  const meta = allFolderMeta(ctx);
  const items: TrashItem[] = [];

  for (const f of meta.values()) {
    if (!f.deletedAt) continue;
    items.push({
      type: "folder",
      id: f.id,
      title: f.name,
      url: null,
      parentId: f.parentId,
      path: pathOf(meta, f.parentId, rootLabel),
      deletedAt: f.deletedAt,
      groupKey: f.deletedAt,
      siblings: 0,
    });
  }

  const bmRows = getDb()
    .select({
      id: bookmarks.id,
      folderId: bookmarks.folderId,
      titleCt: bookmarks.titleCt,
      urlCt: bookmarks.urlCt,
      deletedAt: bookmarks.deletedAt,
    })
    .from(bookmarks)
    .where(
      and(eq(bookmarks.userId, ctx.userId), isNotNull(bookmarks.deletedAt)),
    )
    .all();
  for (const b of bmRows) {
    if (!b.deletedAt) continue;
    try {
      items.push({
        type: "bookmark",
        id: b.id,
        title: openField(
          ctx.dek,
          ctx.userId,
          "bookmark.title",
          Buffer.from(b.titleCt),
        ),
        url: openField(
          ctx.dek,
          ctx.userId,
          "bookmark.url",
          Buffer.from(b.urlCt),
        ),
        parentId: b.folderId,
        path: pathOf(meta, b.folderId, rootLabel),
        deletedAt: b.deletedAt,
        groupKey: b.deletedAt,
        siblings: 0,
      });
    } catch (err) {
      console.warn(
        `[trash] skip bookmark ${b.id}: decode failed`,
        err instanceof Error ? err.message : err,
      );
    }
  }

  // A cascade delete stamps the whole subtree with one timestamp, so counting
  // by timestamp tells the user "restoring this brings back 37 things".
  const perKey = new Map<string, number>();
  for (const it of items) perKey.set(it.groupKey, (perKey.get(it.groupKey) ?? 0) + 1);
  for (const it of items) it.siblings = (perKey.get(it.groupKey) ?? 1) - 1;

  items.sort((a, b) => b.deletedAt.localeCompare(a.deletedAt));
  return items;
}

/** Folder ids reachable from rootId following parentId, deleted rows included. */
function deletedSubtree(ctx: AuthedContext, rootId: string): string[] {
  const rows = getDb()
    .select({ id: folders.id, parentId: folders.parentId })
    .from(folders)
    .where(eq(folders.userId, ctx.userId))
    .all();
  const childrenOf = new Map<string, string[]>();
  for (const r of rows) {
    if (!r.parentId) continue;
    const list = childrenOf.get(r.parentId) ?? [];
    list.push(r.id);
    childrenOf.set(r.parentId, list);
  }
  const out: string[] = [];
  const queue = [rootId];
  const seen = new Set<string>();
  while (queue.length) {
    const cur = queue.shift()!;
    if (seen.has(cur)) continue;
    seen.add(cur);
    out.push(cur);
    for (const c of childrenOf.get(cur) ?? []) queue.push(c);
  }
  return out;
}

/** True when the folder is missing or itself still in the trash. */
function parentUnavailable(
  ctx: AuthedContext,
  folderId: string | null,
): boolean {
  if (!folderId) return false;
  const row = getDb()
    .select({ deletedAt: folders.deletedAt })
    .from(folders)
    .where(and(eq(folders.id, folderId), eq(folders.userId, ctx.userId)))
    .get();
  return !row || row.deletedAt !== null;
}

export interface RestoreResult {
  folders: number;
  bookmarks: number;
  /** True when the item was reattached to the root because its home is gone. */
  movedToRoot: boolean;
}

export function restoreFolder(
  ctx: AuthedContext,
  id: string,
): RestoreResult {
  const row = getDb()
    .select({
      id: folders.id,
      parentId: folders.parentId,
      deletedAt: folders.deletedAt,
    })
    .from(folders)
    .where(and(eq(folders.id, id), eq(folders.userId, ctx.userId)))
    .get();
  if (!row || !row.deletedAt) throw NotFound("Not in the trash");
  const stamp = row.deletedAt;
  const subtree = deletedSubtree(ctx, id);

  // Only rows stamped in the same action come back. A child deleted earlier,
  // on its own, stays in the trash — restoring a parent must not resurrect
  // things the user removed deliberately at another time.
  const folderIds = getDb()
    .select({ id: folders.id })
    .from(folders)
    .where(
      and(
        eq(folders.userId, ctx.userId),
        inArray(folders.id, subtree),
        eq(folders.deletedAt, stamp),
      ),
    )
    .all()
    .map((r) => r.id);

  const bookmarkIds =
    folderIds.length > 0
      ? getDb()
          .select({ id: bookmarks.id })
          .from(bookmarks)
          .where(
            and(
              eq(bookmarks.userId, ctx.userId),
              inArray(bookmarks.folderId, folderIds),
              eq(bookmarks.deletedAt, stamp),
            ),
          )
          .all()
          .map((r) => r.id)
      : [];

  const movedToRoot = parentUnavailable(ctx, row.parentId);
  const now = new Date().toISOString();

  const tx = getSqlite().transaction(() => {
    getDb()
      .update(folders)
      .set({ deletedAt: null, updatedAt: now })
      .where(inArray(folders.id, folderIds))
      .run();
    if (bookmarkIds.length > 0) {
      getDb()
        .update(bookmarks)
        .set({ deletedAt: null, updatedAt: now })
        .where(inArray(bookmarks.id, bookmarkIds))
        .run();
    }
    if (movedToRoot) {
      getDb()
        .update(folders)
        .set({ parentId: null })
        .where(eq(folders.id, id))
        .run();
    }
  });
  tx();

  const landedIn = movedToRoot ? null : row.parentId;
  resealSharesForFolderTree(ctx, landedIn);
  rebuildPanelsForFolderTree(ctx, landedIn);
  return {
    folders: folderIds.length,
    bookmarks: bookmarkIds.length,
    movedToRoot,
  };
}

export function restoreBookmark(
  ctx: AuthedContext,
  id: string,
): RestoreResult {
  const row = getDb()
    .select({
      id: bookmarks.id,
      folderId: bookmarks.folderId,
      deletedAt: bookmarks.deletedAt,
    })
    .from(bookmarks)
    .where(and(eq(bookmarks.id, id), eq(bookmarks.userId, ctx.userId)))
    .get();
  if (!row || !row.deletedAt) throw NotFound("Not in the trash");

  const movedToRoot = parentUnavailable(ctx, row.folderId);
  const landedIn = movedToRoot ? null : row.folderId;
  getDb()
    .update(bookmarks)
    .set({
      deletedAt: null,
      folderId: landedIn,
      updatedAt: new Date().toISOString(),
    })
    .where(eq(bookmarks.id, id))
    .run();

  resealSharesForFolderTree(ctx, landedIn);
  rebuildPanelsForFolderTree(ctx, landedIn);
  return { folders: 0, bookmarks: 1, movedToRoot };
}

/**
 * Hard-delete trashed rows and everything hanging off them: tag links, version
 * history, the snapshot text index and the blobs on disk. Only rows already in
 * the trash are touched, so a bug here can never reach live content.
 */
export async function purgeTrash(
  ctx: AuthedContext,
  opts: { olderThanDays?: number } = {},
): Promise<{ folders: number; bookmarks: number }> {
  const cutoff =
    opts.olderThanDays === undefined
      ? null
      : new Date(Date.now() - opts.olderThanDays * 86_400_000).toISOString();

  const folderRows = getDb()
    .select({
      id: folders.id,
      iconBlobPath: folders.iconBlobPath,
      imageBlobPath: folders.imageBlobPath,
      deletedAt: folders.deletedAt,
    })
    .from(folders)
    .where(and(eq(folders.userId, ctx.userId), isNotNull(folders.deletedAt)))
    .all()
    .filter((r) => !cutoff || (r.deletedAt ?? "") < cutoff);

  const bookmarkRows = getDb()
    .select({
      id: bookmarks.id,
      iconBlobPath: bookmarks.iconBlobPath,
      imageBlobPath: bookmarks.imageBlobPath,
      snapshotHtmlPath: bookmarks.snapshotHtmlPath,
      snapshotScreenshotPath: bookmarks.snapshotScreenshotPath,
      snapshotTextPath: bookmarks.snapshotTextPath,
      deletedAt: bookmarks.deletedAt,
    })
    .from(bookmarks)
    .where(
      and(eq(bookmarks.userId, ctx.userId), isNotNull(bookmarks.deletedAt)),
    )
    .all()
    .filter((r) => !cutoff || (r.deletedAt ?? "") < cutoff);

  const folderIds = folderRows.map((r) => r.id);
  const bookmarkIds = bookmarkRows.map((r) => r.id);
  if (folderIds.length === 0 && bookmarkIds.length === 0) {
    return { folders: 0, bookmarks: 0 };
  }

  const tx = getSqlite().transaction(() => {
    if (bookmarkIds.length > 0) {
      getDb()
        .delete(bookmarkTags)
        .where(inArray(bookmarkTags.bookmarkId, bookmarkIds))
        .run();
      getDb()
        .delete(entityVersions)
        .where(
          and(
            eq(entityVersions.userId, ctx.userId),
            eq(entityVersions.entityType, "bookmark"),
            inArray(entityVersions.entityId, bookmarkIds),
          ),
        )
        .run();
      // Symlinks to a purged row would render as a dangling placeholder
      // forever, so they go too.
      getDb()
        .delete(bookmarks)
        .where(
          and(
            eq(bookmarks.userId, ctx.userId),
            inArray(bookmarks.aliasOf, bookmarkIds),
          ),
        )
        .run();
      getDb().delete(bookmarks).where(inArray(bookmarks.id, bookmarkIds)).run();
    }
    if (folderIds.length > 0) {
      getDb()
        .delete(folderTags)
        .where(inArray(folderTags.folderId, folderIds))
        .run();
      getDb()
        .delete(entityVersions)
        .where(
          and(
            eq(entityVersions.userId, ctx.userId),
            eq(entityVersions.entityType, "folder"),
            inArray(entityVersions.entityId, folderIds),
          ),
        )
        .run();
      getDb()
        .delete(folders)
        .where(
          and(
            eq(folders.userId, ctx.userId),
            inArray(folders.aliasOf, folderIds),
          ),
        )
        .run();
      getDb().delete(folders).where(inArray(folders.id, folderIds)).run();
    }
  });
  tx();

  for (const id of bookmarkIds) deleteSnapshotIndex(id);

  // Attached files go with their entity. Left behind they would be
  // unreachable rows whose bytes still count against the quota.
  await purgeAttachmentsFor(ctx.userId, "folder", folderIds);
  await purgeAttachmentsFor(ctx.userId, "bookmark", bookmarkIds);

  // Blobs last: the DB rows are already gone, so a failed unlink leaves an
  // orphan file rather than an unreachable row.
  const paths: Array<string | null> = [];
  for (const f of folderRows) paths.push(f.iconBlobPath, f.imageBlobPath);
  for (const b of bookmarkRows) {
    paths.push(
      b.iconBlobPath,
      b.imageBlobPath,
      b.snapshotHtmlPath,
      b.snapshotScreenshotPath,
      b.snapshotTextPath,
    );
  }
  for (const p of paths) {
    try {
      await deleteBlob(p);
    } catch (err) {
      console.warn(
        `[trash] could not remove blob ${p}`,
        err instanceof Error ? err.message : err,
      );
    }
  }

  return { folders: folderIds.length, bookmarks: bookmarkIds.length };
}

/** Purge a single trashed item (and, for a folder, nothing else). */
export async function purgeOne(
  ctx: AuthedContext,
  type: "folder" | "bookmark",
  id: string,
): Promise<void> {
  if (type === "bookmark") {
    const row = getDb()
      .select({ deletedAt: bookmarks.deletedAt })
      .from(bookmarks)
      .where(and(eq(bookmarks.id, id), eq(bookmarks.userId, ctx.userId)))
      .get();
    if (!row?.deletedAt) throw NotFound("Not in the trash");
    getDb().delete(bookmarkTags).where(eq(bookmarkTags.bookmarkId, id)).run();
    getDb()
      .delete(entityVersions)
      .where(
        and(
          eq(entityVersions.userId, ctx.userId),
          eq(entityVersions.entityType, "bookmark"),
          eq(entityVersions.entityId, id),
        ),
      )
      .run();
    const blobs = getDb()
      .select({
        iconBlobPath: bookmarks.iconBlobPath,
        imageBlobPath: bookmarks.imageBlobPath,
        snapshotHtmlPath: bookmarks.snapshotHtmlPath,
        snapshotScreenshotPath: bookmarks.snapshotScreenshotPath,
        snapshotTextPath: bookmarks.snapshotTextPath,
      })
      .from(bookmarks)
      .where(eq(bookmarks.id, id))
      .get();
    getDb().delete(bookmarks).where(eq(bookmarks.aliasOf, id)).run();
    getDb().delete(bookmarks).where(eq(bookmarks.id, id)).run();
    deleteSnapshotIndex(id);
    await purgeAttachmentsFor(ctx.userId, "bookmark", [id]);
    for (const p of Object.values(blobs ?? {})) await deleteBlob(p);
    return;
  }

  const frow = getDb()
    .select({ deletedAt: folders.deletedAt })
    .from(folders)
    .where(and(eq(folders.id, id), eq(folders.userId, ctx.userId)))
    .get();
  if (!frow?.deletedAt) throw NotFound("Not in the trash");

  getDb().delete(folderTags).where(eq(folderTags.folderId, id)).run();
  getDb()
    .delete(entityVersions)
    .where(
      and(
        eq(entityVersions.userId, ctx.userId),
        eq(entityVersions.entityType, "folder"),
        eq(entityVersions.entityId, id),
      ),
    )
    .run();
  const blobs = getDb()
    .select({
      iconBlobPath: folders.iconBlobPath,
      imageBlobPath: folders.imageBlobPath,
    })
    .from(folders)
    .where(eq(folders.id, id))
    .get();
  getDb().delete(folders).where(eq(folders.aliasOf, id)).run();
  getDb().delete(folders).where(eq(folders.id, id)).run();
  await purgeAttachmentsFor(ctx.userId, "folder", [id]);
  for (const p of Object.values(blobs ?? {})) await deleteBlob(p);
}

/** How many rows are sitting in the trash (used for the sidebar badge). */
export function trashCount(ctx: AuthedContext): number {
  const f = getDb()
    .select({ id: folders.id })
    .from(folders)
    .where(and(eq(folders.userId, ctx.userId), isNotNull(folders.deletedAt)))
    .all().length;
  const b = getDb()
    .select({ id: bookmarks.id })
    .from(bookmarks)
    .where(
      and(eq(bookmarks.userId, ctx.userId), isNotNull(bookmarks.deletedAt)),
    )
    .all().length;
  return f + b;
}
