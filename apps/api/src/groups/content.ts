import { and, eq, inArray, isNull } from "drizzle-orm";
import type { AuthedContext } from "../auth/session.js";
import { openField } from "../auth/encryption.js";
import { getDb } from "../db/client.js";
import {
  bookmarkTags,
  bookmarks,
  folderTags,
  folders,
  groupShares,
  groups,
  tags,
} from "../db/schema.js";
import { Conflict, Forbidden, NotFound } from "../util/errors.js";
import { sanitizeRichText } from "../util/sanitize.js";
import { readShareAsset, type ShareAssetKind } from "./assets.js";
import { openGroupField, sealGroupField, unwrapGroupDek } from "./encryption.js";

/** A tag as it travels in a share: by name and colour, never by id. The
 * member has their own tag table and none of the owner's ids mean anything
 * in it. */
export interface SharedTag {
  name: string;
  color: string;
}

/**
 * The look of a node, carried so a member sees the folder the way its owner
 * designed it rather than a generic card.
 *
 * `icon` and `image` are cache-busting version tokens (the source row's
 * updatedAt), non-null only when the seal job managed to copy the asset into
 * the share. The bytes deliberately live outside this payload (see
 * assets.ts): the whole payload is decrypted and JSON-parsed on every read of
 * the share, and a 4 MB background inlined here would be paid for on each one.
 */
interface SharedAppearance {
  bgColor: string | null;
  textTone: string | null;
  favorite: boolean;
  tags: SharedTag[];
  icon: string | null;
  image: string | null;
}

// Optional because payloads sealed before this existed are still on disk and
// are read back as-is until their next re-seal. Readers must tolerate the gap.
export interface SharedBookmarkContent extends Partial<SharedAppearance> {
  type: "bookmark";
  id: string;
  title: string;
  url: string;
  description: string | null;
}

export interface SharedFolderContent extends Partial<SharedAppearance> {
  type: "folder";
  id: string;
  name: string;
  description: string | null;
  bookmarks: SharedBookmarkContent[];
  subfolders: SharedFolderContent[];
}

export type SharedContent = SharedBookmarkContent | SharedFolderContent;

/** An icon/background the seal job has to copy into the share. */
export interface ShareAssetSource {
  nodeId: string;
  kind: "icon" | "image";
  /** AAD field the source blob was sealed with, e.g. "folder.icon". */
  field: string;
  srcPath: string;
  version: string;
}

/**
 * Build (and re-cipher) the snapshot payload for a group share. Called by the
 * worker. Requires the sharer's DEK to be cached (they were online when they
 * shared) so we can decrypt the source content with their key.
 *
 * Icons and backgrounds are only *declared* here (with their source path
 * pushed onto `assets`); copying the bytes is async and belongs to the caller.
 */
export function buildPayloadForShare(
  sharerUserId: string,
  sharerDek: Buffer,
  shareRow: typeof groupShares.$inferSelect,
  assets: ShareAssetSource[] = [],
): SharedContent {
  if (shareRow.sourceType === "bookmark") {
    return loadBookmark(sharerUserId, sharerDek, shareRow.sourceId, assets);
  }
  return loadFolder(sharerUserId, sharerDek, shareRow.sourceId, assets);
}

/** Tag names + colours for a set of entities, keyed by entity id. */
function tagsFor(
  userId: string,
  kind: "folder" | "bookmark",
  ids: string[],
): Map<string, SharedTag[]> {
  const out = new Map<string, SharedTag[]>();
  if (ids.length === 0) return out;
  const rows =
    kind === "folder"
      ? getDb()
          .select({
            entityId: folderTags.folderId,
            name: tags.name,
            color: tags.color,
          })
          .from(folderTags)
          .innerJoin(tags, eq(tags.id, folderTags.tagId))
          .where(
            and(inArray(folderTags.folderId, ids), eq(tags.userId, userId)),
          )
          .all()
      : getDb()
          .select({
            entityId: bookmarkTags.bookmarkId,
            name: tags.name,
            color: tags.color,
          })
          .from(bookmarkTags)
          .innerJoin(tags, eq(tags.id, bookmarkTags.tagId))
          .where(
            and(inArray(bookmarkTags.bookmarkId, ids), eq(tags.userId, userId)),
          )
          .all();
  for (const r of rows) {
    const list = out.get(r.entityId) ?? [];
    list.push({ name: r.name, color: r.color });
    out.set(r.entityId, list);
  }
  return out;
}

/**
 * Record the node's icon/background as something to copy, and return the
 * version tokens to put in the payload. A node whose blob is missing simply
 * gets nulls: the share still works, it just falls back to the default look.
 */
function declareAssets(
  assets: ShareAssetSource[],
  entity: "folder" | "bookmark",
  row: {
    id: string;
    iconBlobPath: string | null;
    imageBlobPath: string | null;
    updatedAt: string;
  },
): { icon: string | null; image: string | null } {
  const out: { icon: string | null; image: string | null } = {
    icon: null,
    image: null,
  };
  if (row.iconBlobPath) {
    assets.push({
      nodeId: row.id,
      kind: "icon",
      field: `${entity}.icon`,
      srcPath: row.iconBlobPath,
      version: row.updatedAt,
    });
    out.icon = row.updatedAt;
  }
  if (row.imageBlobPath) {
    assets.push({
      nodeId: row.id,
      kind: "image",
      field: `${entity}.bg`,
      srcPath: row.imageBlobPath,
      version: row.updatedAt,
    });
    out.image = row.updatedAt;
  }
  return out;
}

function loadBookmark(
  userId: string,
  dek: Buffer,
  bookmarkId: string,
  assets: ShareAssetSource[],
  knownTags?: Map<string, SharedTag[]>,
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
    bgColor: row.bgColor ?? null,
    textTone: row.textTone ?? null,
    favorite: row.favorite,
    tags:
      knownTags?.get(row.id) ??
      tagsFor(userId, "bookmark", [row.id]).get(row.id) ??
      [],
    ...declareAssets(assets, "bookmark", row),
  };
}

function loadFolder(
  userId: string,
  dek: Buffer,
  folderId: string,
  assets: ShareAssetSource[],
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

  const bookmarkTagsById = tagsFor(
    userId,
    "bookmark",
    childBookmarks.map((b) => b.id),
  );

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
    bgColor: row.bgColor ?? null,
    textTone: row.textTone ?? null,
    favorite: row.favorite,
    tags: tagsFor(userId, "folder", [row.id]).get(row.id) ?? [],
    ...declareAssets(assets, "folder", row),
    bookmarks: childBookmarks.map((b) =>
      loadBookmark(userId, dek, b.id, assets, bookmarkTagsById),
    ),
    subfolders: childFolders.map((f) =>
      loadFolder(userId, dek, f.id, assets),
    ),
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
  /**
   * Nodes a member created that have not been written back to the owner's rows
   * yet. `fresh` is built from those rows, so it does not know about them; if
   * they were not carried over, an owner's edit anywhere in the subtree would
   * silently delete a bookmark a member had just added.
   */
  pendingIds: Set<string> = new Set(),
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
    const prevFolder = prev && prev.type === "folder" ? prev : null;
    // Anything the group added here and the owner has not received yet, put
    // back where it was.
    const keptBookmarks = (prevFolder?.bookmarks ?? []).filter(
      (b) => pendingIds.has(b.id) && !n.bookmarks.some((x) => x.id === b.id),
    );
    const keptFolders = (prevFolder?.subfolders ?? []).filter(
      (f) => pendingIds.has(f.id) && !n.subfolders.some((x) => x.id === f.id),
    );
    return {
      ...n,
      name: prevFolder ? prevFolder.name : n.name,
      description: prev ? prev.description : n.description,
      bookmarks: [...n.bookmarks.map(applyBookmark), ...keptBookmarks],
      subfolders: [...n.subfolders.map(applyFolder), ...keptFolders],
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

/**
 * The plaintext bytes of one icon/background inside a share. Membership is
 * verified at the route layer; the group AAD does the rest, so a file that
 * belongs to another group cannot be opened here even if its path were
 * guessed.
 */
export async function readGroupShareAsset(
  shareId: string,
  nodeId: string,
  kind: ShareAssetKind,
): Promise<Buffer | null> {
  const row = getDb()
    .select({
      groupId: groupShares.groupId,
      sharedBy: groupShares.sharedBy,
      groupDekWrapped: groups.groupDekWrapped,
    })
    .from(groupShares)
    .innerJoin(groups, eq(groups.id, groupShares.groupId))
    .where(eq(groupShares.id, shareId))
    .get();
  if (!row) return null;
  const groupDek = unwrapGroupDek(row.groupId, Buffer.from(row.groupDekWrapped));
  return readShareAsset(
    row.sharedBy,
    shareId,
    nodeId,
    kind,
    row.groupId,
    groupDek,
  );
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
