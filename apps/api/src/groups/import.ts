import type { AuthedContext } from "../auth/session.js";
import { createBookmark } from "../bookmarks/service.js";
import { createFolder } from "../folders/service.js";
import type { SharedContent, SharedFolderContent } from "./content.js";

/**
 * Recursively create real, owned folders/bookmarks from a shared snapshot so
 * the recipient can manage them like their own. Only the top-level node is
 * tagged with the share origin (the group name), so the UI marks it as
 * "shared"; descendants are plain owned content. This is a point-in-time copy.
 */
export function importShareToHome(
  ctx: AuthedContext,
  content: SharedContent,
  parentId: string | null,
  groupName: string,
): { id: string; type: "folder" | "bookmark" } {
  if (content.type === "bookmark") {
    const b = createBookmark(ctx, {
      folderId: parentId,
      url: content.url,
      title: content.title,
      description: content.description ?? undefined,
      shareOrigin: groupName,
      fetchSnapshot: false,
    });
    return { id: b.id, type: "bookmark" };
  }
  const f = createFolder(ctx, {
    parentId,
    name: content.name,
    description: content.description ?? undefined,
    shareOrigin: groupName,
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
      fetchSnapshot: false,
    });
  }
  for (const sf of folder.subfolders) {
    const child = createFolder(ctx, {
      parentId,
      name: sf.name,
      description: sf.description ?? undefined,
    });
    importChildren(ctx, sf, child.id);
  }
}
