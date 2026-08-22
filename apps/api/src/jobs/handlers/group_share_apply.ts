import { and, eq, isNull } from "drizzle-orm";
import type { AuthedContext } from "../../auth/session.js";
import { groupKeyFor } from "../../groups/keys.js";
import { getDb } from "../../db/client.js";
import { bookmarks, folders, groupShares, groups } from "../../db/schema.js";
import { aeadEncrypt } from "@awesome-bookmarks/crypto";
import { join } from "node:path";
import {
  createBookmark,
  moveBookmark,
  setBookmarkBgImagePath,
  setBookmarkIconPath,
  updateBookmark,
} from "../../bookmarks/service.js";
import {
  createFolder,
  moveFolder,
  setFolderBgImagePath,
  setFolderIconPath,
  updateFolder,
} from "../../folders/service.js";
import { readShareAsset } from "../../groups/assets.js";
import {
  bookmarkBlobDir,
  folderBlobDir,
  writeBlob,
} from "../../storage/blobs.js";
import { createTag, listTags } from "../../tags/service.js";
import { clearOps, pendingOps, type ShareOp } from "../../groups/ops.js";
import { deleteBookmark } from "../../bookmarks/service.js";
import { deleteFolder } from "../../folders/service.js";

interface Payload {
  groupShareId: string;
}

/**
 * Replay a group member's edits into the owner's real folders.
 *
 * This is the second half of an editor share. The member's change is already
 * in the shared payload (see groups/ops.ts), so the group can see it; this is
 * what stops the owner's own library from drifting away from it.
 *
 * It runs as the *owner*, because the rows are encrypted with their key, which
 * is why it can only happen while they are online. Until then the job sits in
 * `pending_user_key`, exactly like the seal job.
 *
 * Each operation is applied on its own and dropped from the queue whether it
 * worked or not: an operation that no longer makes sense (a folder the owner
 * deleted in the meantime) must not wedge the queue behind it forever.
 */
export async function runGroupShareApplyJob(
  userId: string,
  dek: Buffer,
  payload: Payload,
) {
  const row = getDb()
    .select({
      shareId: groupShares.id,
      groupId: groupShares.groupId,
      sharedBy: groupShares.sharedBy,
      sourceType: groupShares.sourceType,
      sourceId: groupShares.sourceId,
      groupDekWrapped: groups.groupDekWrapped,
    })
    .from(groupShares)
    .innerJoin(groups, eq(groups.id, groupShares.groupId))
    .where(eq(groupShares.id, payload.groupShareId))
    .get();
  if (!row) return; // revoked while the owner was away; nothing to write back
  if (row.sharedBy !== userId) {
    throw new Error("Job user does not match share owner");
  }

  const groupDek = groupKeyFor({ userId, dek } as AuthedContext, row.groupId);
  const ops = pendingOps(row.shareId, row.groupId, groupDek);
  if (ops.length === 0) return;

  const ctx: AuthedContext = { userId, dek } as AuthedContext;
  const done: string[] = [];
  for (const { id, op } of ops) {
    try {
      applyOne(ctx, op, row.sourceType === "folder" ? row.sourceId : null, {
        shareId: row.shareId,
        groupId: row.groupId,
        groupDek,
      });
    } catch (err) {
      console.error(
        `[share-apply] ${row.shareId} ${op.kind} ${op.id}:`,
        err instanceof Error ? err.message : err,
      );
    }
    done.push(id);
  }
  clearOps(done);
}

/** The share's root node is the owner's own folder, so a node whose parent is
 * that root belongs directly in it. */
function resolveParent(
  parentId: string | null | undefined,
  shareRootId: string | null,
): string | null {
  if (!parentId) return shareRootId;
  return parentId;
}

/**
 * Write positions 0..n-1 straight to the rows.
 *
 * Deliberately not through moveFolder/moveBookmark: each of those re-seals
 * every share the folder belongs to, and doing that once per sibling would
 * turn a reorder of ten items into ten rebuilds of the same payload.
 */
function renumber(
  ctx: AuthedContext,
  kind: "folder" | "bookmark",
  ids: string[],
): void {
  ids.forEach((id, position) => {
    if (kind === "folder") {
      getDb()
        .update(folders)
        .set({ position })
        .where(and(eq(folders.id, id), eq(folders.userId, ctx.userId)))
        .run();
    } else {
      getDb()
        .update(bookmarks)
        .set({ position })
        .where(and(eq(bookmarks.id, id), eq(bookmarks.userId, ctx.userId)))
        .run();
    }
  });
}

/** Whether this id is one of the owner's folders; if not, it is a bookmark. */
function isOwnFolder(ctx: AuthedContext, id: string): boolean {
  return !!getDb()
    .select({ id: folders.id })
    .from(folders)
    .where(
      and(
        eq(folders.id, id),
        eq(folders.userId, ctx.userId),
        isNull(folders.deletedAt),
      ),
    )
    .get();
}

function applyOne(
  ctx: AuthedContext,
  op: ShareOp,
  shareRootId: string | null,
  share: { shareId: string; groupId: string; groupDek: Buffer },
) {
  switch (op.kind) {
    case "create_folder": {
      // The id was minted when the member acted and is already in the payload;
      // reusing it here is what keeps the node the same node once the share is
      // re-sealed from these rows.
      createFolder(ctx, {
        id: op.id,
        parentId: resolveParent(op.parentId, shareRootId),
        name: op.name ?? "",
      });
      return;
    }
    case "create_bookmark": {
      createBookmark(ctx, {
        id: op.id,
        folderId: resolveParent(op.parentId, shareRootId),
        url: op.url ?? "",
        title: op.title,
        fetchSnapshot: false,
      });
      return;
    }
    case "edit_node": {
      if (isOwnFolder(ctx, op.id)) {
        updateFolder(ctx, op.id, {
          ...(op.name !== undefined ? { name: op.name } : {}),
          ...(op.description !== undefined ? { description: op.description } : {}),
        });
      } else {
        updateBookmark(ctx, op.id, {
          ...(op.title !== undefined ? { title: op.title } : {}),
          ...(op.url !== undefined ? { url: op.url } : {}),
          ...(op.description !== undefined ? { description: op.description } : {}),
        });
      }
      return;
    }
    case "delete_node": {
      if (op.nodeKind === "folder") deleteFolder(ctx, op.id);
      else deleteBookmark(ctx, op.id);
      return;
    }
    case "move_node": {
      const target = resolveParent(op.parentId, shareRootId);
      // The index the member dropped it at, so a reorder inside the share
      // becomes the same reorder in the owner's folder.
      const at = op.position ?? 0;
      if (op.nodeKind === "folder") moveFolder(ctx, op.id, target, at);
      else moveBookmark(ctx, op.id, target, at);
      // Then renumber the siblings to the order the share has. The move above
      // writes one index and leaves the rest with the numbers they had, so
      // without this the folder ends up with ties and an arbitrary order.
      if (op.order?.length) renumber(ctx, op.nodeKind ?? "bookmark", op.order);
      return;
    }
    case "set_asset": {
      // No version = the member cleared the image (only backgrounds can be
      // cleared, same as the personal flow).
      if (!op.version) {
        if (isOwnFolder(ctx, op.id)) setFolderBgImagePath(ctx, op.id, null);
        else setBookmarkBgImagePath(ctx, op.id, null);
        return;
      }
      // The bytes are in the share's asset store under the group key; put them
      // in the owner's blob store under theirs, which is what makes the icon
      // theirs from then on.
      void applyAsset(ctx, op, share);
      return;
    }
    case "set_favorite": {
      const patch = { favorite: !!op.favorite };
      if (isOwnFolder(ctx, op.id)) updateFolder(ctx, op.id, patch);
      else updateBookmark(ctx, op.id, patch);
      return;
    }
    case "set_tags": {
      // Tags arrive by name because the owner's tag rows are theirs alone.
      // Match by name in the owner's account and create what is missing, the
      // same rule the archive import uses.
      const existing = new Map(
        listTags(ctx).map((t) => [t.name.toLowerCase(), t.id]),
      );
      const ids = (op.tags ?? []).map((name) => {
        const hit = existing.get(name.toLowerCase());
        if (hit) return hit;
        const made = createTag(ctx, { name, color: "#64748b" });
        existing.set(name.toLowerCase(), made.id);
        return made.id;
      });
      if (isOwnFolder(ctx, op.id)) updateFolder(ctx, op.id, { tagIds: ids });
      else updateBookmark(ctx, op.id, { tagIds: ids });
      return;
    }
    case "set_appearance": {
      const patch = {
        ...(op.bgColor !== undefined ? { bgColor: op.bgColor } : {}),
        ...(op.textTone !== undefined
          ? { textTone: op.textTone as "auto" | "light" | "dark" | null }
          : {}),
      };
      if (isOwnFolder(ctx, op.id)) updateFolder(ctx, op.id, patch);
      else updateBookmark(ctx, op.id, patch);
      return;
    }
  }
}


/**
 * Move a member-uploaded image from the share's store into the owner's.
 *
 * Async, so it cannot sit in the switch above with the synchronous cases; the
 * job does not wait for it because a failed copy should cost that one image,
 * not the whole queue.
 */
async function applyAsset(
  ctx: AuthedContext,
  op: ShareOp,
  share: { shareId: string; groupId: string; groupDek: Buffer },
): Promise<void> {
  if (!op.assetKind) return;
  try {
    const bytes = await readShareAsset(
      ctx.userId,
      share.shareId,
      op.id,
      op.assetKind,
      share.groupId,
      share.groupDek,
    );
    if (!bytes) return;
    const folder = isOwnFolder(ctx, op.id);
    const dir = folder
      ? folderBlobDir(ctx.userId, op.id)
      : bookmarkBlobDir(ctx.userId, op.id);
    const aad = `${folder ? "folder" : "bookmark"}.${
      op.assetKind === "icon" ? "icon" : "bg"
    }`;
    const path = await writeBlob(
      ctx.userId,
      join(dir, op.assetKind === "icon" ? "user-icon.bin" : "user-bg.bin"),
      aeadEncrypt(ctx.dek, bytes, `${ctx.userId}|${aad}`),
    );
    if (folder) {
      if (op.assetKind === "icon") setFolderIconPath(ctx, op.id, path);
      else setFolderBgImagePath(ctx, op.id, path);
    } else {
      if (op.assetKind === "icon") setBookmarkIconPath(ctx, op.id, path);
      else setBookmarkBgImagePath(ctx, op.id, path);
    }
  } catch (err) {
    console.error(
      `[share-apply] asset ${op.id}/${op.assetKind}:`,
      err instanceof Error ? err.message : err,
    );
  }
}
