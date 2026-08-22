import type { Bookmark, Folder, Tag } from "@awesome-bookmarks/shared";
import { api } from "../api.js";
import type { EntitySource } from "../components/EntityGrid.js";
import type {
  SharedBookmarkPayload,
  SharedFolderPayload,
} from "../components/SharedNodeEditor.js";

/**
 * The share payload, dressed as the rows the folder grid already knows how to
 * draw.
 *
 * A shared folder you can edit should not look like a lesser version of your
 * own, and the way to guarantee that is to render it with the same components
 * rather than a parallel set that drifts. The payload carries the same facts
 * under different names, so the adapter is mostly renaming — plus the fields
 * the grid reads but a share has no notion of, which get honest defaults.
 */

const EPOCH = "1970-01-01T00:00:00.000Z";

/** Tags travel by name; the grid wants ids, so the name *is* the id here. That
 * is also why a share's chips do not link anywhere (see EntitySource). */
export function tagsOf(node: {
  tags?: { name: string; color: string }[] | undefined;
}): Tag[] {
  return (node.tags ?? []).map((t) => ({
    id: t.name,
    name: t.name,
    color: t.color,
    createdAt: EPOCH,
  }));
}

export function asFolder(
  node: SharedFolderPayload,
  parentId: string | null,
  position: number,
): Folder {
  return {
    id: node.id,
    keyGroupId: null,
    keyScopeId: null,
    shared: true,
    mine: false,
    canWrite: true,
    parentId,
    name: node.name,
    description: node.description,
    // The bytes live in the share, not in the member's blob store; the source
    // below turns these flags into the right URL.
    iconBlobPath: node.icon ?? null,
    imageBlobPath: node.image ?? null,
    bgColor: node.bgColor ?? null,
    textTone: (node.textTone ?? null) as Folder["textTone"],
    shareOrigin: null,
    favorite: node.favorite ?? false,
    aliasOf: null,
    linkedShareId: null,
    position,
    rev: 1,
    tagIds: (node.tags ?? []).map((t) => t.name),
    createdAt: EPOCH,
    updatedAt: node.icon ?? node.image ?? EPOCH,
  };
}

export function asBookmark(
  node: SharedBookmarkPayload,
  folderId: string | null,
  position: number,
): Bookmark {
  return {
    id: node.id,
    keyGroupId: null,
    keyScopeId: null,
    shared: true,
    mine: false,
    canWrite: true,
    folderId,
    title: node.title,
    url: node.url,
    description: node.description,
    iconBlobPath: node.icon ?? null,
    imageBlobPath: node.image ?? null,
    bgColor: node.bgColor ?? null,
    textTone: (node.textTone ?? null) as Bookmark["textTone"],
    // A share carries no archived page: snapshots are the owner's, and fetching
    // one on a member's behalf would be a different feature.
    snapshotStatus: "none",
    hasSnapshot: false,
    favorite: node.favorite ?? false,
    aliasOf: null,
    shareOrigin: null,
    position,
    rev: 1,
    tagIds: (node.tags ?? []).map((t) => t.name),
    createdAt: EPOCH,
    updatedAt: node.icon ?? node.image ?? EPOCH,
  };
}

/**
 * Where a shared card's pictures come from, and what a member is not allowed
 * to do with someone else's rows.
 */
export function shareSource(
  shareId: string,
  rev: number,
  onDone: () => void,
): EntitySource {
  const url = (id: string, kind: "icon" | "image", token: string | null) =>
    token ? api.sharedAssetUrl(shareId, id, kind, token) : null;
  return {
    folderIconUrl: (f) => url(f.id, "icon", f.iconBlobPath),
    bookmarkIconUrl: (b) => url(b.id, "icon", b.iconBlobPath),
    folderBgUrl: (f) => url(f.id, "image", f.imageBlobPath),
    bookmarkBgUrl: (b) => url(b.id, "image", b.imageBlobPath ?? null),
    canFavorite: true,
    // The star flips the flag in the shared copy for the whole group, and is
    // written back to the owner's row like every other edit here. It is a
    // shared favourite, not a private one: a share has no per-user state.
    onToggleFavorite: async (_kind, id, next) => {
      await api.setSharedFavorite(shareId, id, next, rev);
      onDone();
    },
    canDrag: true,
    // Order lives in the shared copy as the order of the children, so a drop
    // is a move to an index (see Layout's share branch).
    shareId,
    shareRev: rev,
    canLinkTags: false,
    // The personal detail page would 404 (the id belongs to the owner), so
    // titles go to the share's own detail page instead.
    bookmarkHref: (b) => `/shared/${shareId}/bookmark/${b.id}`,
  };
}
