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
import { Conflict, Forbidden, NotFound } from "../util/errors.js";
import { sanitizeRichText } from "../util/sanitize.js";
import { openGroupField, sealGroupField, unwrapGroupDek } from "./encryption.js";

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

/**
 * Overlay the group's in-place field edits (title/url/name/description) from a
 * previous editor-share payload onto a freshly rebuilt tree, matched by node
 * id. Structure (added/removed/moved nodes) comes from `fresh`; the group's
 * collaborative field edits on nodes that still exist are preserved from `old`.
 * Used only for editor shares so re-materializing the owner's structural
 * changes never wipes the group's edits. Viewer shares use `fresh` verbatim.
 */
export function mergeEditorFieldEdits(
  fresh: SharedContent,
  old: SharedContent,
): SharedContent {
  const oldById = new Map<string, SharedContent>();
  const index = (n: SharedContent): void => {
    oldById.set(n.id, n);
    if (n.type === "folder") {
      for (const b of n.bookmarks) oldById.set(b.id, b);
      for (const f of n.subfolders) index(f);
    }
  };
  index(old);

  const applyBookmark = (n: SharedBookmarkContent): SharedBookmarkContent => {
    const prev = oldById.get(n.id);
    if (prev && prev.type === "bookmark") {
      return {
        ...n,
        title: prev.title,
        url: prev.url,
        description: prev.description,
      };
    }
    return n;
  };
  const applyFolder = (n: SharedFolderContent): SharedFolderContent => {
    const prev = oldById.get(n.id);
    return {
      ...n,
      name: prev && prev.type === "folder" ? prev.name : n.name,
      description: prev ? prev.description : n.description,
      bookmarks: n.bookmarks.map(applyBookmark),
      subfolders: n.subfolders.map(applyFolder),
    };
  };

  return fresh.type === "folder" ? applyFolder(fresh) : applyBookmark(fresh);
}

export interface SharedContentResult {
  content: SharedContent;
  access: "viewer" | "editor";
  rev: number;
}

function loadShareRow(shareId: string) {
  const row = getDb()
    .select({
      shareId: groupShares.id,
      groupId: groupShares.groupId,
      payloadCt: groupShares.payloadCt,
      payloadStatus: groupShares.payloadStatus,
      access: groupShares.access,
      rev: groupShares.rev,
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
  return row;
}

/** Read a sealed group share back out as plaintext (+ its access level/rev). */
export function readGroupShareContent(
  ctx: AuthedContext,
  shareId: string,
): SharedContentResult {
  // Membership is verified at the route layer before this is invoked.
  void ctx;
  const row = loadShareRow(shareId);
  const groupDek = unwrapGroupDek(row.groupId, Buffer.from(row.groupDekWrapped));
  const json = openGroupField(
    groupDek,
    row.groupId,
    "share.payload",
    Buffer.from(row.payloadCt!),
  );
  return {
    content: JSON.parse(json) as SharedContent,
    access: row.access as "viewer" | "editor",
    rev: row.rev,
  };
}

function findNode(tree: SharedContent, nodeId: string): SharedContent | null {
  if (tree.id === nodeId) return tree;
  if (tree.type === "folder") {
    for (const b of tree.bookmarks) if (b.id === nodeId) return b;
    for (const f of tree.subfolders) {
      const found = findNode(f, nodeId);
      if (found) return found;
    }
  }
  return null;
}

/**
 * Edit one node's fields inside an editable ("editor") group share. The whole
 * payload is re-sealed with the group key. Optimistic concurrency via rev.
 * Membership is verified at the route layer.
 */
export function editSharedNode(
  ctx: AuthedContext,
  shareId: string,
  nodeId: string,
  fields: {
    title?: string;
    url?: string;
    name?: string;
    description?: string | null;
    baseRev?: number;
  },
): SharedContentResult {
  void ctx;
  const row = loadShareRow(shareId);
  if (row.access !== "editor") {
    throw Forbidden("This share is read-only");
  }
  const groupDek = unwrapGroupDek(row.groupId, Buffer.from(row.groupDekWrapped));
  const tree = JSON.parse(
    openGroupField(groupDek, row.groupId, "share.payload", Buffer.from(row.payloadCt!)),
  ) as SharedContent;

  const node = findNode(tree, nodeId);
  if (!node) throw NotFound("Node not found in share");
  if (node.type === "bookmark") {
    if (fields.title !== undefined) node.title = fields.title;
    if (fields.url !== undefined) node.url = fields.url;
  } else {
    if (fields.name !== undefined) node.name = fields.name;
  }
  if (fields.description !== undefined) {
    node.description = fields.description
      ? sanitizeRichText(fields.description)
      : null;
  }

  const sealed = sealGroupField(
    groupDek,
    row.groupId,
    "share.payload",
    JSON.stringify(tree),
  );
  const where =
    fields.baseRev !== undefined
      ? and(eq(groupShares.id, shareId), eq(groupShares.rev, fields.baseRev))
      : eq(groupShares.id, shareId);
  const res = getDb()
    .update(groupShares)
    .set({ payloadCt: sealed, rev: row.rev + 1, updatedAt: new Date().toISOString() })
    .where(where)
    .run();
  if (fields.baseRev !== undefined && res.changes === 0) {
    throw Conflict("stale_write");
  }
  return { content: tree, access: "editor", rev: row.rev + 1 };
}
