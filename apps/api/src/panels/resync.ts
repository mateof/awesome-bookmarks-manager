import { and, eq, inArray, isNull, ne } from "drizzle-orm";
import type { AuthedContext } from "../auth/session.js";
import { getDb } from "../db/client.js";
import { folders, jobs, panels } from "../db/schema.js";
import { enqueue } from "../jobs/queue.js";

/**
 * Keep published panels in sync with the owner's live content: when something
 * inside a panel's source subtree changes, enqueue a rebuild so the public
 * snapshot is regenerated in the background.
 *
 * Symlinks make "inside" wider than the parent chain: a panel can contain a
 * folder because some alias points at it. So the reachable set is the changed
 * folder's ancestors, plus the ancestors of every alias that targets any of
 * them.
 *
 * The rebuild job needs the owner's DEK, which is cached because the owner is
 * the one making the edit.
 */

const MAX_DEPTH = 100;

/** The folder and all its ancestors. */
function folderChain(userId: string, folderId: string): string[] {
  const chain: string[] = [];
  let cur: string | null = folderId;
  let guard = 0;
  while (cur && guard++ < MAX_DEPTH) {
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

/**
 * Every folder from which `folderId` is reachable: its own ancestors plus the
 * ancestors of any symlink pointing into that chain.
 */
function reachableFrom(userId: string, folderId: string): Set<string> {
  const out = new Set<string>();
  const queue = [folderId];
  let guard = 0;
  while (queue.length && guard++ < MAX_DEPTH) {
    const cur = queue.shift()!;
    for (const id of folderChain(userId, cur)) out.add(id);
    // Aliases that target anything already reachable pull their own branch in.
    const aliases = getDb()
      .select({ id: folders.id })
      .from(folders)
      .where(
        and(
          eq(folders.userId, userId),
          inArray(folders.aliasOf, [...out]),
          isNull(folders.deletedAt),
        ),
      )
      .all();
    for (const a of aliases) {
      if (!out.has(a.id)) queue.push(a.id);
    }
  }
  return out;
}

/** Skip enqueueing when a rebuild for this panel is already waiting. */
function alreadyQueued(userId: string, panelId: string): boolean {
  const pending = getDb()
    .select({ id: jobs.id, payload: jobs.payload })
    .from(jobs)
    .where(
      and(
        eq(jobs.userId, userId),
        eq(jobs.type, "panel_rebuild"),
        ne(jobs.status, "done"),
      ),
    )
    .all();
  return pending.some((j) => {
    try {
      return (JSON.parse(j.payload) as { panelId?: string }).panelId === panelId;
    } catch {
      return false;
    }
  });
}

/** Rebuild every panel whose source subtree contains this folder. */
export function rebuildPanelsForFolderTree(
  ctx: AuthedContext,
  folderId: string | null,
): void {
  if (!folderId) return;
  const ids = [...reachableFrom(ctx.userId, folderId)];
  if (ids.length === 0) return;
  const affected = getDb()
    .select({ id: panels.id })
    .from(panels)
    .where(and(eq(panels.userId, ctx.userId), inArray(panels.folderId, ids)))
    .all();
  for (const p of affected) {
    if (alreadyQueued(ctx.userId, p.id)) continue;
    enqueue({ userId: ctx.userId, type: "panel_rebuild", payload: { panelId: p.id } });
  }
}

/** A bookmark change affects the panels covering the folder it lives in. */
export function rebuildPanelsForBookmark(
  ctx: AuthedContext,
  folderId: string | null,
): void {
  rebuildPanelsForFolderTree(ctx, folderId);
}
