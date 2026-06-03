import { aeadEncrypt, deriveShareKey } from "@awesome-bookmarks/crypto";
import { and, eq, isNull } from "drizzle-orm";
import { openField } from "../../auth/encryption.js";
import { getDb } from "../../db/client.js";
import {
  bookmarks,
  folders,
  shareLinks,
} from "../../db/schema.js";

interface ShareSealPayload {
  shareId: string;
}

interface BookmarkPayload {
  type: "bookmark";
  id: string;
  title: string;
  url: string;
  description: string | null;
}

interface FolderPayload {
  type: "folder";
  id: string;
  name: string;
  description: string | null;
  bookmarks: BookmarkPayload[];
  subfolders: FolderPayload[];
}

export async function runShareSealJob(
  userId: string,
  dek: Buffer,
  payload: ShareSealPayload,
) {
  const link = getDb()
    .select()
    .from(shareLinks)
    .where(eq(shareLinks.id, payload.shareId))
    .get();
  if (!link || link.userId !== userId) {
    throw new Error("Share not found");
  }

  const content =
    link.targetType === "bookmark"
      ? buildBookmarkPayload(userId, dek, link.targetId)
      : buildFolderPayload(userId, dek, link.targetId);

  const key = deriveShareKey(link.token);
  const sealed = aeadEncrypt(key, JSON.stringify(content));

  getDb()
    .update(shareLinks)
    .set({ payloadCt: sealed, payloadStatus: "ready" })
    .where(eq(shareLinks.id, link.id))
    .run();
}

function buildBookmarkPayload(
  userId: string,
  dek: Buffer,
  bookmarkId: string,
): BookmarkPayload {
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
  if (!row) throw new Error("Bookmark not found");
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

function buildFolderPayload(
  userId: string,
  dek: Buffer,
  folderId: string,
): FolderPayload {
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
  if (!row) throw new Error("Folder not found");

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
    bookmarks: childBookmarks.map((b) =>
      buildBookmarkPayload(userId, dek, b.id),
    ),
    subfolders: childFolders.map((f) =>
      buildFolderPayload(userId, dek, f.id),
    ),
  };
}
