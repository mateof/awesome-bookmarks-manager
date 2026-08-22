import { and, eq, inArray, or } from "drizzle-orm";
import type { AuthedContext } from "../auth/session.js";
import { getDb } from "../db/client.js";
import { folders, groupShares, groups, jobs } from "../db/schema.js";
import { enqueue } from "../jobs/queue.js";
import type { SharedContent } from "./content.js";
import { openGroupField, unwrapGroupDek } from "./encryption.js";

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

/**
 * Catch-up for shares sealed before the payload carried the owner's design
 * (background, icon, tone, tags). Those payloads sit on disk unchanged until
 * something in the subtree is edited, so without this an existing share would
 * keep looking generic until its owner happened to touch it.
 *
 * Run at boot. The seal job needs the sharer's DEK, so it parks in
 * `pending_user_key` until they next log in, which is the earliest their
 * content can be re-read anyway.
 */
export function backfillShareAppearance(): void {
  const rows = getDb()
    .select({
      id: groupShares.id,
      groupId: groupShares.groupId,
      sharedBy: groupShares.sharedBy,
      payloadCt: groupShares.payloadCt,
      payloadStatus: groupShares.payloadStatus,
      groupDekWrapped: groups.groupDekWrapped,
    })
    .from(groupShares)
    .innerJoin(groups, eq(groups.id, groupShares.groupId))
    .all();

  let queued = 0;
  for (const r of rows) {
    if (r.payloadStatus !== "ready" || !r.payloadCt) continue;
    let tree: SharedContent;
    // No member is present in a background sweep, so the only key available is
    // the master-wrapped copy, which exists solely for groups that opted into
    // being recoverable. The rest are skipped: the resync is an optimisation,
    // and not being able to run it is not a failure.
    if (!r.groupDekWrapped) continue;
    try {
      const groupDek = unwrapGroupDek(
        r.groupId,
        Buffer.from(r.groupDekWrapped),
      );
      tree = JSON.parse(
        openGroupField(
          groupDek,
          r.groupId,
          "share.payload",
          Buffer.from(r.payloadCt),
        ),
      ) as SharedContent;
    } catch {
      continue; // unreadable payload: a re-seal is not going to help
    }
    // `tags` only exists in payloads built by the current seal job.
    if (Array.isArray(tree.tags)) continue;
    if (sealAlreadyQueued(r.id)) continue;
    enqueueSeal(r.sharedBy, r.id);
    queued++;
  }
  if (queued > 0) {
    console.log(`[groups] re-sealing ${queued} share(s) to carry appearance`);
  }
}

/** Restarting before the owner logs in must not stack up duplicate jobs. */
function sealAlreadyQueued(shareId: string): boolean {
  return !!getDb()
    .select({ id: jobs.id })
    .from(jobs)
    .where(
      and(
        eq(jobs.type, "group_share_seal"),
        eq(jobs.payload, JSON.stringify({ groupShareId: shareId })),
        or(eq(jobs.status, "pending"), eq(jobs.status, "pending_user_key")),
      ),
    )
    .get();
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
