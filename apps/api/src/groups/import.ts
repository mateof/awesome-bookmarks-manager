import { aeadEncrypt } from "@awesome-bookmarks/crypto";
import { join } from "node:path";
import type { AuthedContext } from "../auth/session.js";
import {
  createBookmark,
  setBookmarkBgImagePath,
  setBookmarkIconPath,
} from "../bookmarks/service.js";
import {
  createFolder,
  setFolderBgImagePath,
  setFolderIconPath,
} from "../folders/service.js";
import { bookmarkBlobDir, folderBlobDir, writeBlob } from "../storage/blobs.js";
import { createTag, listTags } from "../tags/service.js";
import { readGroupShareAsset } from "./content.js";
import type {
  SharedContent,
  SharedFolderContent,
  SharedTag,
} from "./content.js";

export type ImportResult = { id: string; type: "folder" | "bookmark" };

/**
 * Tags travel by name, so importing has to map them onto the recipient's own
 * tag table: reuse a tag they already have with that name, create the rest.
 * Same rule as the .abz archive import, and for the same reason: the owner's
 * tag ids mean nothing in another account.
 */
function tagResolver(ctx: AuthedContext): (tags: SharedTag[]) => string[] {
  const existing = new Map(listTags(ctx).map((t) => [t.name.toLowerCase(), t]));
  const created = new Map<string, string>();
  return (list) =>
    (list ?? []).map((tag) => {
      const key = tag.name.toLowerCase();
      const hit = existing.get(key);
      if (hit) return hit.id;
      const already = created.get(key);
      if (already) return already;
      const made = createTag(ctx, { name: tag.name, color: tag.color });
      created.set(key, made.id);
      return made.id;
    });
}

/**
 * Re-seal the share's copy of an icon/background under the importing user's
 * own key, so their copy keeps the look it had in the share. Best effort: an
 * asset that cannot be read just leaves the entity with the default look.
 */
async function copyAssets(
  ctx: AuthedContext,
  shareId: string,
  node: SharedContent,
  newId: string,
): Promise<void> {
  const isFolder = node.type === "folder";
  const dir = isFolder
    ? folderBlobDir(ctx.userId, newId)
    : bookmarkBlobDir(ctx.userId, newId);
  const prefix = isFolder ? "folder" : "bookmark";

  for (const [kind, file] of [
    ["icon", "user-icon.bin"],
    ["image", "user-bg.bin"],
  ] as const) {
    if (!node[kind]) continue;
    try {
      const bytes = await readGroupShareAsset(shareId, node.id, kind);
      if (!bytes) continue;
      const aad = `${prefix}.${kind === "icon" ? "icon" : "bg"}`;
      const path = await writeBlob(
        ctx.userId,
        join(dir, file),
        aeadEncrypt(ctx.dek, bytes, `${ctx.userId}|${aad}`),
      );
      if (isFolder) {
        if (kind === "icon") setFolderIconPath(ctx, newId, path);
        else setFolderBgImagePath(ctx, newId, path);
      } else {
        if (kind === "icon") setBookmarkIconPath(ctx, newId, path);
        else setBookmarkBgImagePath(ctx, newId, path);
      }
    } catch (err) {
      console.error(
        `[share-import] ${shareId} ${node.id}/${kind}:`,
        err instanceof Error ? err.message : err,
      );
    }
  }
}

/**
 * Live link ("symlink") import: for a folder share, create a single portal
 * folder that mirrors the share (linkedShareId). Opening it renders the
 * share's current content, so the owner's changes show up live, and it carries
 * the "shared" badge. Bookmark shares can't be portals, so they fall back to a
 * badged copy.
 *
 * The portal folder itself is a real row in the recipient's tree, so it takes
 * a copy of the shared node's own look: in the parent listing it should look
 * like the folder it points at, not like a blank one.
 */
export async function linkShareToHome(
  ctx: AuthedContext,
  content: SharedContent,
  parentId: string | null,
  groupName: string,
  shareId: string,
): Promise<ImportResult> {
  const resolveTags = tagResolver(ctx);
  if (content.type === "bookmark") {
    const b = createBookmark(ctx, {
      folderId: parentId,
      url: content.url,
      title: content.title,
      description: content.description ?? undefined,
      bgColor: content.bgColor,
      textTone: content.textTone,
      tagIds: resolveTags(content.tags ?? []),
      shareOrigin: groupName,
      fetchSnapshot: false,
    });
    await copyAssets(ctx, shareId, content, b.id);
    return { id: b.id, type: "bookmark" };
  }
  const f = createFolder(ctx, {
    parentId,
    name: content.name,
    description: content.description ?? undefined,
    bgColor: content.bgColor,
    textTone: content.textTone,
    tagIds: resolveTags(content.tags ?? []),
    shareOrigin: groupName,
    linkedShareId: shareId,
  });
  await copyAssets(ctx, shareId, content, f.id);
  return { id: f.id, type: "folder" };
}

/**
 * Snapshot copy import: recursively create real, owned folders/bookmarks from
 * the shared snapshot so the recipient can manage them like their own. A
 * point-in-time copy, fully owned, with no "shared" badge (shareOrigin stays
 * null) since it no longer tracks the source.
 */
export async function copyShareToHome(
  ctx: AuthedContext,
  content: SharedContent,
  parentId: string | null,
  shareId: string,
): Promise<ImportResult> {
  const resolveTags = tagResolver(ctx);
  if (content.type === "bookmark") {
    const b = createBookmark(ctx, {
      folderId: parentId,
      url: content.url,
      title: content.title,
      description: content.description ?? undefined,
      bgColor: content.bgColor,
      textTone: content.textTone,
      favorite: content.favorite,
      tagIds: resolveTags(content.tags ?? []),
      fetchSnapshot: false,
    });
    await copyAssets(ctx, shareId, content, b.id);
    return { id: b.id, type: "bookmark" };
  }
  const f = createFolder(ctx, {
    parentId,
    name: content.name,
    description: content.description ?? undefined,
    bgColor: content.bgColor,
    textTone: content.textTone,
    favorite: content.favorite,
    tagIds: resolveTags(content.tags ?? []),
  });
  await copyAssets(ctx, shareId, content, f.id);
  await importChildren(ctx, content, f.id, shareId, resolveTags);
  return { id: f.id, type: "folder" };
}

async function importChildren(
  ctx: AuthedContext,
  folder: SharedFolderContent,
  parentId: string,
  shareId: string,
  resolveTags: (tags: SharedTag[]) => string[],
): Promise<void> {
  for (const b of folder.bookmarks) {
    const created = createBookmark(ctx, {
      folderId: parentId,
      url: b.url,
      title: b.title,
      description: b.description ?? undefined,
      bgColor: b.bgColor,
      textTone: b.textTone,
      favorite: b.favorite,
      tagIds: resolveTags(b.tags ?? []),
      fetchSnapshot: false,
    });
    await copyAssets(ctx, shareId, b, created.id);
  }
  for (const sf of folder.subfolders) {
    const child = createFolder(ctx, {
      parentId,
      name: sf.name,
      description: sf.description ?? undefined,
      bgColor: sf.bgColor,
      textTone: sf.textTone,
      favorite: sf.favorite,
      tagIds: resolveTags(sf.tags ?? []),
    });
    await copyAssets(ctx, shareId, sf, child.id);
    await importChildren(ctx, sf, child.id, shareId, resolveTags);
  }
}
