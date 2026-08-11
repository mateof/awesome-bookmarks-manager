import type { AuthedContext } from "../auth/session.js";
import { createBookmark } from "../bookmarks/service.js";
import { createFolder } from "../folders/service.js";
import type { SharedContent, SharedFolderContent } from "./content.js";

export type ImportResult = { id: string; type: "folder" | "bookmark" };

/**
 * Live link ("symlink") import: for a folder share, create a single portal
 * folder that mirrors the share (linkedShareId). Opening it renders the
 * share's current content, so the owner's changes show up live, and it carries
 * the "shared" badge. Bookmark shares can't be portals, so they fall back to a
 * badged copy.
 */
export function linkShareToHome(
  ctx: AuthedContext,
  content: SharedContent,
  parentId: string | null,
  groupName: string,
  shareId: string,
): ImportResult {
  if (content.type === "bookmark") {
    const b = createBookmark(ctx, {
      folderId: parentId,
      url: content.url,
      title: content.title,
      description: content.description ?? undefined,
      bgColor: content.bgColor,
      shareOrigin: groupName,
      fetchSnapshot: false,
    });
    return { id: b.id, type: "bookmark" };
  }
  const f = createFolder(ctx, {
    parentId,
    name: content.name,
    description: content.description ?? undefined,
    bgColor: content.bgColor,
    shareOrigin: groupName,
    linkedShareId: shareId,
  });
  return { id: f.id, type: "folder" };
}

/**
 * Snapshot copy import: recursively create real, owned folders/bookmarks from
 * the shared snapshot so the recipient can manage them like their own. A
 * point-in-time copy, fully owned, with no "shared" badge (shareOrigin stays
 * null) since it no longer tracks the source.
 */
export function copyShareToHome(
  ctx: AuthedContext,
  content: SharedContent,
  parentId: string | null,
): ImportResult {
  if (content.type === "bookmark") {
    const b = createBookmark(ctx, {
      folderId: parentId,
      url: content.url,
      title: content.title,
      description: content.description ?? undefined,
      bgColor: content.bgColor,
      fetchSnapshot: false,
    });
    return { id: b.id, type: "bookmark" };
  }
  const f = createFolder(ctx, {
    parentId,
    name: content.name,
    description: content.description ?? undefined,
    bgColor: content.bgColor,
  });
  importChildren(ctx, content, f.id);
  return { id: f.id, type: "folder" };
}

function importChildren(
  ctx: AuthedContext,
  folder: SharedFolderContent,
  parentId: string,
): void {
  for (const b of folder.bookmarks) {
    createBookmark(ctx, {
      folderId: parentId,
      url: b.url,
      title: b.title,
      description: b.description ?? undefined,
      bgColor: b.bgColor,
      fetchSnapshot: false,
    });
  }
  for (const sf of folder.subfolders) {
    const child = createFolder(ctx, {
      parentId,
      name: sf.name,
      description: sf.description ?? undefined,
      bgColor: sf.bgColor,
    });
    importChildren(ctx, sf, child.id);
  }
}
