import type { Bookmark, Folder } from "@awesome-bookmarks/shared";
import { basename, join } from "node:path";
import type { AuthedContext } from "../auth/session.js";
import {
  createBookmark,
  getBookmark,
  listBookmarks,
  setBookmarkBgImagePath,
  setBookmarkIconPath,
} from "../bookmarks/service.js";
import { bookmarkBlobDir, copyBlob, folderBlobDir } from "../storage/blobs.js";
import { NotFound } from "../util/errors.js";
import {
  createFolder,
  getFolder,
  listFolders,
  setFolderBgImagePath,
  setFolderIconPath,
} from "./service.js";

export type CopyResult = { id: string; type: "folder" | "bookmark" };

async function copyFolderBlobs(
  ctx: AuthedContext,
  src: Folder,
  newId: string,
): Promise<void> {
  if (src.iconBlobPath) {
    const p = await copyBlob(
      ctx.userId,
      src.iconBlobPath,
      join(folderBlobDir(ctx.userId, newId), basename(src.iconBlobPath)),
    );
    setFolderIconPath(ctx, newId, p);
  }
  if (src.imageBlobPath) {
    const p = await copyBlob(
      ctx.userId,
      src.imageBlobPath,
      join(folderBlobDir(ctx.userId, newId), basename(src.imageBlobPath)),
    );
    setFolderBgImagePath(ctx, newId, p);
  }
}

async function copyBookmarkBlobs(
  ctx: AuthedContext,
  src: Bookmark,
  newId: string,
): Promise<void> {
  if (src.iconBlobPath) {
    const p = await copyBlob(
      ctx.userId,
      src.iconBlobPath,
      join(bookmarkBlobDir(ctx.userId, newId), basename(src.iconBlobPath)),
    );
    setBookmarkIconPath(ctx, newId, p);
  }
  if (src.imageBlobPath) {
    const p = await copyBlob(
      ctx.userId,
      src.imageBlobPath,
      join(bookmarkBlobDir(ctx.userId, newId), basename(src.imageBlobPath)),
    );
    setBookmarkBgImagePath(ctx, newId, p);
  }
}

function newBookmarkFrom(
  ctx: AuthedContext,
  b: Bookmark,
  folderId: string | null,
): Bookmark {
  return createBookmark(ctx, {
    folderId,
    url: b.url,
    title: b.title,
    description: b.description ?? undefined,
    bgColor: b.bgColor ?? undefined,
    tagIds: b.tagIds,
    fetchSnapshot: false,
  });
}

function newFolderFrom(
  ctx: AuthedContext,
  f: Folder,
  parentId: string | null,
): Folder {
  return createFolder(ctx, {
    parentId,
    name: f.name,
    description: f.description ?? undefined,
    bgColor: f.bgColor ?? undefined,
    tagIds: f.tagIds,
  });
}

/** Duplicate a single bookmark into `destFolderId` (null = root). */
export async function copyBookmarkTo(
  ctx: AuthedContext,
  srcId: string,
  destFolderId: string | null,
): Promise<CopyResult> {
  const src = getBookmark(ctx, srcId);
  const created = newBookmarkFrom(ctx, src, destFolderId);
  await copyBookmarkBlobs(ctx, src, created.id);
  return { id: created.id, type: "bookmark" };
}

/**
 * Duplicate a folder and its whole subtree under `destParentId` (null = root).
 * The source tree is read once up front, so it terminates even when copying
 * into the folder's own descendant (a snapshot copy, no cycle).
 */
export async function copyFolderTree(
  ctx: AuthedContext,
  srcId: string,
  destParentId: string | null,
): Promise<CopyResult> {
  const allFolders = listFolders(ctx);
  const allBookmarks = listBookmarks(ctx, {});
  const src = allFolders.find((f) => f.id === srcId);
  if (!src) throw NotFound("Folder not found");

  const foldersByParent = new Map<string, Folder[]>();
  for (const f of allFolders) {
    if (!f.parentId) continue;
    const arr = foldersByParent.get(f.parentId) ?? [];
    arr.push(f);
    foldersByParent.set(f.parentId, arr);
  }
  const bookmarksByFolder = new Map<string | null, Bookmark[]>();
  for (const b of allBookmarks) {
    const arr = bookmarksByFolder.get(b.folderId) ?? [];
    arr.push(b);
    bookmarksByFolder.set(b.folderId, arr);
  }

  const copyChildren = async (
    srcFolderId: string,
    destFolderId: string,
  ): Promise<void> => {
    for (const b of bookmarksByFolder.get(srcFolderId) ?? []) {
      const created = newBookmarkFrom(ctx, b, destFolderId);
      await copyBookmarkBlobs(ctx, b, created.id);
    }
    for (const f of foldersByParent.get(srcFolderId) ?? []) {
      const created = newFolderFrom(ctx, f, destFolderId);
      await copyFolderBlobs(ctx, f, created.id);
      await copyChildren(f.id, created.id);
    }
  };

  const newTop = newFolderFrom(ctx, src, destParentId);
  await copyFolderBlobs(ctx, src, newTop.id);
  await copyChildren(srcId, newTop.id);
  return { id: newTop.id, type: "folder" };
}
