import { and, eq, inArray } from "drizzle-orm";
import type { AuthedContext } from "../auth/session.js";
import { getDb } from "../db/client.js";
import { folders, groupShares } from "../db/schema.js";
import { enqueue } from "../jobs/queue.js";

/**
 * Keep group shares in sync with the owner's live content: when the owner
 * changes something inside a shared folder subtree, re-enqueue the seal job so
 * the materialized snapshot is rebuilt from the current state and members see
 * the change. This applies to both viewer and editor shares; for editor shares
 * the seal job overlays the group's in-place field edits on surviving nodes
 * (see mergeEditorFieldEdits) so re-materializing structure never wipes them.
 *
 * The seal job needs the sharer's DEK, which is cached because the sharer is
 * the one making the edit.
 */
function folderChain(userId: string, folderId: string): string[] {
  const chain: string[] = [];
  let cur: string | null = folderId;
  let guard = 0;
  while (cur && guard++ < 100) {
    chain.push(cur);
    const row = getDb()
      .select({ parentId: folders.parentId })
      .from(folders)
      .where(and(eq(folders.id, cur), eq(folders.userId, userId)))
      .get();
    cur = row?.parentId ?? null;
  }
  return chain;
}

function enqueueSeal(userId: string, shareId: string): void {
  enqueue({
    userId,
    type: "group_share_seal",
    payload: { groupShareId: shareId },
  });
}

/** Re-seal my shares whose folder source is at or above this folder. */
export function resealSharesForFolderTree(
  ctx: AuthedContext,
  folderId: string | null,
): void {
  if (!folderId) return;
  const ids = folderChain(ctx.userId, folderId);
  if (ids.length === 0) return;
  const shares = getDb()
    .select({ id: groupShares.id })
    .from(groupShares)
    .where(
      and(
        eq(groupShares.sharedBy, ctx.userId),
        eq(groupShares.sourceType, "folder"),
        inArray(groupShares.sourceId, ids),
      ),
    )
    .all();
  for (const s of shares) enqueueSeal(ctx.userId, s.id);
}

/** Re-seal shares affected by a bookmark edit (a direct bookmark share and
 * any folder share whose subtree contains it). */
export function resealSharesForBookmark(
  ctx: AuthedContext,
  bookmarkId: string,
  folderId: string | null,
): void {
  const direct = getDb()
    .select({ id: groupShares.id })
    .from(groupShares)
    .where(
      and(
        eq(groupShares.sharedBy, ctx.userId),
        eq(groupShares.sourceType, "bookmark"),
        eq(groupShares.sourceId, bookmarkId),
      ),
    )
    .all();
  for (const s of direct) enqueueSeal(ctx.userId, s.id);
  resealSharesForFolderTree(ctx, folderId);
}
