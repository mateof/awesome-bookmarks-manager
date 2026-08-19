import { and, asc, eq } from "drizzle-orm";
import { v4 as uuidv4 } from "uuid";
import type { AuthedContext } from "../auth/session.js";
import { getDb } from "../db/client.js";
import { groupShareOps, groupShares, groups } from "../db/schema.js";
import { enqueue } from "../jobs/queue.js";
import { Conflict, Forbidden, NotFound } from "../util/errors.js";
import { sanitizeRichText } from "../util/sanitize.js";
import type {
  SharedBookmarkContent,
  SharedContent,
  SharedFolderContent,
} from "./content.js";
import { openGroupField, sealGroupField, unwrapGroupDek } from "./encryption.js";

/**
 * Structural editing inside an editor share.
 *
 * The awkward fact this has to work around: a shared folder's real rows belong
 * to the person who shared it and are encrypted with *their* key. A member
 * adding a bookmark cannot write it there — the server does not have the
 * owner's key while the member is the one acting, and the owner may not have
 * logged in for a week.
 *
 * So each change happens twice:
 *
 *  1. Straight away in the share payload, which is sealed with the group key.
 *     Every member sees it immediately, which is what "shared folder" has to
 *     mean to be worth anything.
 *  2. Queued as an operation that is replayed into the owner's real folders
 *     the next time they are online. The job needs their key, so it parks in
 *     `pending_user_key` until then — the same mechanism the seal job uses.
 *
 * The id of a new node is minted here and used in both places, so when the
 * write-back lands and the share is re-sealed from the owner's rows, the node
 * keeps its identity instead of appearing to be replaced by a copy of itself.
 */

export type ShareOpKind =
  | "create_folder"
  | "create_bookmark"
  | "edit_node"
  | "delete_node";

export interface ShareOp {
  kind: ShareOpKind;
  /** The node the operation is about (the new one, for creates). */
  id: string;
  parentId?: string | null;
  name?: string;
  title?: string;
  url?: string;
  description?: string | null;
  nodeKind?: "folder" | "bookmark";
}

interface ShareRow {
  shareId: string;
  groupId: string;
  sharedBy: string;
  access: string;
  rev: number;
  payloadCt: Buffer;
  groupDek: Buffer;
}

function loadEditableShare(shareId: string): ShareRow {
  const row = getDb()
    .select({
      shareId: groupShares.id,
      groupId: groupShares.groupId,
      sharedBy: groupShares.sharedBy,
      access: groupShares.access,
      rev: groupShares.rev,
      payloadCt: groupShares.payloadCt,
      payloadStatus: groupShares.payloadStatus,
      groupDekWrapped: groups.groupDekWrapped,
    })
    .from(groupShares)
    .innerJoin(groups, eq(groups.id, groupShares.groupId))
    .where(eq(groupShares.id, shareId))
    .get();
  if (!row) throw NotFound("Share not found");
  if (row.access !== "editor") throw Forbidden("This share is read-only");
  if (row.payloadStatus !== "ready" || !row.payloadCt) {
    throw Forbidden("Share is still being prepared");
  }
  return {
    shareId: row.shareId,
    groupId: row.groupId,
    sharedBy: row.sharedBy,
    access: row.access,
    rev: row.rev,
    payloadCt: Buffer.from(row.payloadCt),
    groupDek: unwrapGroupDek(row.groupId, Buffer.from(row.groupDekWrapped)),
  };
}

function readPayload(row: ShareRow): SharedContent {
  return JSON.parse(
    openGroupField(row.groupDek, row.groupId, "share.payload", row.payloadCt),
  ) as SharedContent;
}

/** Find the folder a new node goes into: a node id inside the share, or the
 * share's own root when null. */
function folderAt(
  tree: SharedContent,
  folderId: string | null | undefined,
): SharedFolderContent {
  if (tree.type !== "folder") {
    throw Forbidden("Only a shared folder can hold new items");
  }
  if (!folderId || folderId === tree.id) return tree;
  const walk = (f: SharedFolderContent): SharedFolderContent | null => {
    for (const sub of f.subfolders) {
      if (sub.id === folderId) return sub;
      const deeper = walk(sub);
      if (deeper) return deeper;
    }
    return null;
  };
  const found = walk(tree);
  if (!found) throw NotFound("Folder not found in share");
  return found;
}

/** Remove a node from wherever it is; returns what it was. */
function detach(
  tree: SharedFolderContent,
  nodeId: string,
): "folder" | "bookmark" | null {
  const bIdx = tree.bookmarks.findIndex((b) => b.id === nodeId);
  if (bIdx >= 0) {
    tree.bookmarks.splice(bIdx, 1);
    return "bookmark";
  }
  const fIdx = tree.subfolders.findIndex((f) => f.id === nodeId);
  if (fIdx >= 0) {
    tree.subfolders.splice(fIdx, 1);
    return "folder";
  }
  for (const sub of tree.subfolders) {
    const hit = detach(sub, nodeId);
    if (hit) return hit;
  }
  return null;
}

function persist(
  ctx: AuthedContext,
  row: ShareRow,
  tree: SharedContent,
  op: ShareOp,
  baseRev?: number,
): { rev: number } {
  const sealed = sealGroupField(
    row.groupDek,
    row.groupId,
    "share.payload",
    JSON.stringify(tree),
  );
  const where =
    baseRev !== undefined
      ? and(eq(groupShares.id, row.shareId), eq(groupShares.rev, baseRev))
      : eq(groupShares.id, row.shareId);
  const res = getDb()
    .update(groupShares)
    .set({
      payloadCt: sealed,
      rev: row.rev + 1,
      updatedAt: new Date().toISOString(),
    })
    .where(where)
    .run();
  if (baseRev !== undefined && res.changes === 0) throw Conflict("stale_write");

  getDb()
    .insert(groupShareOps)
    .values({
      id: uuidv4(),
      shareId: row.shareId,
      groupId: row.groupId,
      actorUserId: ctx.userId,
      kind: op.kind,
      payloadCt: sealGroupField(
        row.groupDek,
        row.groupId,
        "share.op",
        JSON.stringify(op),
      ),
    })
    .run();

  // For the owner, not for the member acting: it is the owner's key the
  // write-back needs. Parks until they next log in.
  enqueue({
    userId: row.sharedBy,
    type: "group_share_apply",
    payload: { groupShareId: row.shareId },
  });

  return { rev: row.rev + 1 };
}

export function createSharedFolder(
  ctx: AuthedContext,
  shareId: string,
  input: { parentId?: string | null; name: string; baseRev?: number },
): { id: string; rev: number } {
  const row = loadEditableShare(shareId);
  const tree = readPayload(row);
  const parent = folderAt(tree, input.parentId);
  const id = uuidv4();
  const node: SharedFolderContent = {
    type: "folder",
    id,
    name: input.name,
    description: null,
    bgColor: null,
    textTone: null,
    favorite: false,
    tags: [],
    icon: null,
    image: null,
    bookmarks: [],
    subfolders: [],
  };
  parent.subfolders.push(node);
  const { rev } = persist(
    ctx,
    row,
    tree,
    { kind: "create_folder", id, parentId: parent.id, name: input.name },
    input.baseRev,
  );
  return { id, rev };
}

export function createSharedBookmark(
  ctx: AuthedContext,
  shareId: string,
  input: {
    folderId?: string | null;
    url: string;
    title?: string;
    baseRev?: number;
  },
): { id: string; rev: number } {
  const row = loadEditableShare(shareId);
  const tree = readPayload(row);
  const parent = folderAt(tree, input.folderId);
  const id = uuidv4();
  const title = input.title?.trim() || input.url;
  const node: SharedBookmarkContent = {
    type: "bookmark",
    id,
    title,
    url: input.url,
    description: null,
    bgColor: null,
    textTone: null,
    favorite: false,
    tags: [],
    icon: null,
    image: null,
  };
  parent.bookmarks.push(node);
  const { rev } = persist(
    ctx,
    row,
    tree,
    { kind: "create_bookmark", id, parentId: parent.id, title, url: input.url },
    input.baseRev,
  );
  return { id, rev };
}

export function deleteSharedNode(
  ctx: AuthedContext,
  shareId: string,
  nodeId: string,
  baseRev?: number,
): { rev: number } {
  const row = loadEditableShare(shareId);
  const tree = readPayload(row);
  if (tree.type !== "folder") throw Forbidden("Nothing to delete here");
  if (tree.id === nodeId) {
    // Deleting the shared folder itself would mean deleting the owner's
    // folder from inside their own share; revoking is the way to do that.
    throw Forbidden("The shared folder itself cannot be deleted from here");
  }
  const kind = detach(tree, nodeId);
  if (!kind) throw NotFound("Node not found in share");
  const { rev } = persist(
    ctx,
    row,
    tree,
    { kind: "delete_node", id: nodeId, nodeKind: kind },
    baseRev,
  );
  return { rev };
}

/** Queue a field edit for write-back. The payload has already been updated by
 * `editSharedNode`; this is what eventually carries it to the owner. */
export function queueFieldEdit(
  ctx: AuthedContext,
  shareId: string,
  nodeId: string,
  fields: { title?: string; url?: string; name?: string; description?: string | null },
): void {
  const row = loadEditableShare(shareId);
  getDb()
    .insert(groupShareOps)
    .values({
      id: uuidv4(),
      shareId: row.shareId,
      groupId: row.groupId,
      actorUserId: ctx.userId,
      kind: "edit_node",
      payloadCt: sealGroupField(
        row.groupDek,
        row.groupId,
        "share.op",
        JSON.stringify({
          kind: "edit_node",
          id: nodeId,
          ...(fields.name !== undefined ? { name: fields.name } : {}),
          ...(fields.title !== undefined ? { title: fields.title } : {}),
          ...(fields.url !== undefined ? { url: fields.url } : {}),
          ...(fields.description !== undefined
            ? {
                description: fields.description
                  ? sanitizeRichText(fields.description)
                  : null,
              }
            : {}),
        } satisfies ShareOp),
      ),
    })
    .run();
  enqueue({
    userId: row.sharedBy,
    type: "group_share_apply",
    payload: { groupShareId: row.shareId },
  });
}

/** Everything still waiting to reach the owner's rows, oldest first. */
export function pendingOps(
  shareId: string,
  groupId: string,
  groupDek: Buffer,
): { id: string; op: ShareOp }[] {
  return getDb()
    .select()
    .from(groupShareOps)
    .where(eq(groupShareOps.shareId, shareId))
    .orderBy(asc(groupShareOps.createdAt))
    .all()
    .map((r) => ({
      id: r.id,
      op: JSON.parse(
        openGroupField(groupDek, groupId, "share.op", Buffer.from(r.payloadCt)),
      ) as ShareOp,
    }));
}

export function clearOps(ids: string[]): void {
  for (const id of ids) {
    getDb().delete(groupShareOps).where(eq(groupShareOps.id, id)).run();
  }
}

/** Ids of nodes a member created that have not reached the owner yet. The seal
 * job needs them: rebuilding from the owner's rows would otherwise drop a
 * bookmark a member added seconds ago. */
export function pendingNodeIds(shareId: string, groupId: string, groupDek: Buffer): Set<string> {
  const out = new Set<string>();
  for (const { op } of pendingOps(shareId, groupId, groupDek)) {
    if (op.kind === "create_folder" || op.kind === "create_bookmark") {
      out.add(op.id);
    }
  }
  return out;
}
