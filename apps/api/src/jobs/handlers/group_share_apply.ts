import { and, eq, isNull } from "drizzle-orm";
import type { AuthedContext } from "../../auth/session.js";
import { getDb } from "../../db/client.js";
import { bookmarks, folders, groupShares, groups } from "../../db/schema.js";
import {
  createBookmark,
  moveBookmark,
  updateBookmark,
} from "../../bookmarks/service.js";
import {
  createFolder,
  moveFolder,
  updateFolder,
} from "../../folders/service.js";
import { createTag, listTags } from "../../tags/service.js";
import { unwrapGroupDek } from "../../groups/encryption.js";
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

  const groupDek = unwrapGroupDek(
    row.groupId,
    Buffer.from(row.groupDekWrapped),
  );
  const ops = pendingOps(row.shareId, row.groupId, groupDek);
  if (ops.length === 0) return;

  const ctx: AuthedContext = { userId, dek } as AuthedContext;
  const done: string[] = [];
  for (const { id, op } of ops) {
    try {
      applyOne(ctx, op, row.sourceType === "folder" ? row.sourceId : null);
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

function applyOne(ctx: AuthedContext, op: ShareOp, shareRootId: string | null) {
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
      if (op.nodeKind === "folder") moveFolder(ctx, op.id, target, 0);
      else moveBookmark(ctx, op.id, target, 0);
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
