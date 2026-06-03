import { and, eq, isNull } from "drizzle-orm";
import type { AuthedContext } from "../auth/session.js";
import { openField } from "../auth/encryption.js";
import { getDb } from "../db/client.js";
import {
  bookmarks,
  folders,
  groupShares,
  groups,
} from "../db/schema.js";
import { Forbidden, NotFound } from "../util/errors.js";
import { openGroupField, unwrapGroupDek } from "./encryption.js";

export interface SharedBookmarkContent {
  type: "bookmark";
  id: string;
  title: string;
  url: string;
  description: string | null;
}

export interface SharedFolderContent {
  type: "folder";
  id: string;
  name: string;
  description: string | null;
  bookmarks: SharedBookmarkContent[];
  subfolders: SharedFolderContent[];
}

export type SharedContent = SharedBookmarkContent | SharedFolderContent;

/**
 * Build (and re-cipher) the snapshot payload for a group share. Called by the
 * worker. Requires the sharer's DEK to be cached (they were online when they
 * shared) so we can decrypt the source content with their key.
 */
export function buildPayloadForShare(
  sharerUserId: string,
  sharerDek: Buffer,
  shareRow: typeof groupShares.$inferSelect,
): SharedContent {
  if (shareRow.sourceType === "bookmark") {
    return loadBookmark(sharerUserId, sharerDek, shareRow.sourceId);
  }
  return loadFolder(sharerUserId, sharerDek, shareRow.sourceId);
}

function loadBookmark(
  userId: string,
  dek: Buffer,
  bookmarkId: string,
): SharedBookmarkContent {
  const row = getDb()
    .select()
    .from(bookmarks)
    .where(
      and(
        eq(bookmarks.id, bookmarkId),
        eq(bookmarks.userId, userId),
        isNull(bookmarks.deletedAt),
      ),
    )
    .get();
  if (!row) throw NotFound("Bookmark not found");
  return {
    type: "bookmark",
    id: row.id,
    title: openField(dek, userId, "bookmark.title", Buffer.from(row.titleCt)),
    url: openField(dek, userId, "bookmark.url", Buffer.from(row.urlCt)),
    description: row.descriptionCt
      ? openField(
          dek,
          userId,
          "bookmark.description",
          Buffer.from(row.descriptionCt),
        )
      : null,
  };
}

function loadFolder(
  userId: string,
  dek: Buffer,
  folderId: string,
): SharedFolderContent {
  const row = getDb()
    .select()
    .from(folders)
    .where(
      and(
        eq(folders.id, folderId),
        eq(folders.userId, userId),
        isNull(folders.deletedAt),
      ),
    )
    .get();
  if (!row) throw NotFound("Folder not found");

  const childFolders = getDb()
    .select()
    .from(folders)
    .where(
      and(
        eq(folders.parentId, folderId),
        eq(folders.userId, userId),
        isNull(folders.deletedAt),
      ),
    )
    .all();
  const childBookmarks = getDb()
    .select()
    .from(bookmarks)
    .where(
      and(
        eq(bookmarks.folderId, folderId),
        eq(bookmarks.userId, userId),
        isNull(bookmarks.deletedAt),
      ),
    )
    .all();

  return {
    type: "folder",
    id: row.id,
    name: openField(dek, userId, "folder.name", Buffer.from(row.nameCt)),
    description: row.descriptionCt
      ? openField(
          dek,
          userId,
          "folder.description",
          Buffer.from(row.descriptionCt),
        )
      : null,
    bookmarks: childBookmarks.map((b) => loadBookmark(userId, dek, b.id)),
    subfolders: childFolders.map((f) => loadFolder(userId, dek, f.id)),
  };
}

/** Read a sealed group share back out as plaintext. */
export function readGroupShareContent(
  ctx: AuthedContext,
  shareId: string,
): SharedContent {
  const row = getDb()
    .select({
      shareId: groupShares.id,
      groupId: groupShares.groupId,
      payloadCt: groupShares.payloadCt,
      payloadStatus: groupShares.payloadStatus,
      groupDekWrapped: groups.groupDekWrapped,
    })
    .from(groupShares)
    .innerJoin(groups, eq(groups.id, groupShares.groupId))
    .where(eq(groupShares.id, shareId))
    .get();
  if (!row) throw NotFound("Share not found");
  if (row.payloadStatus !== "ready" || !row.payloadCt) {
    throw Forbidden("Share is still being prepared");
  }
  // Caller must verify membership before invoking — we don't know ctx here,
  // membership check is handled at the route layer.
  void ctx;
  const groupDek = unwrapGroupDek(row.groupId, Buffer.from(row.groupDekWrapped));
  const json = openGroupField(
    groupDek,
    row.groupId,
    "share.payload",
    Buffer.from(row.payloadCt),
  );
  return JSON.parse(json) as SharedContent;
}
