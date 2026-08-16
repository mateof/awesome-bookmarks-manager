import type { Bookmark, Folder } from "@awesome-bookmarks/shared";
import { and, eq, isNull } from "drizzle-orm";
import { v4 as uuidv4 } from "uuid";
import { sealField } from "../auth/encryption.js";
import type { AuthedContext } from "../auth/session.js";
import { getDb } from "../db/client.js";
import { bookmarks, folders } from "../db/schema.js";
import { getBookmark } from "../bookmarks/service.js";
import { getFolder } from "../folders/service.js";
import { BadRequest, NotFound } from "../util/errors.js";
import { urlHash } from "../util/url.js";

/**
 * Symlinks ("enlaces simbólicos"): an alias row lives in a folder like any
 * other item but mirrors a real folder/bookmark that lives elsewhere. Reads
 * overlay the target's current content, so editing the original is reflected
 * everywhere it is linked — including the panels built from those folders.
 *
 * The alias keeps its own id, parent and position (so it can be ordered and
 * removed independently) and stores a copy of the target's name/url purely to
 * satisfy the NOT NULL columns; the copy is never shown.
 */

/** Every ancestor of `folderId`, closest first. Used for cycle checks. */
function ancestorsOf(ctx: AuthedContext, folderId: string | null): string[] {
  const out: string[] = [];
  let cur = folderId;
  const seen = new Set<string>();
  while (cur && !seen.has(cur)) {
    seen.add(cur);
    out.push(cur);
    const row = getDb()
      .select({ parentId: folders.parentId })
      .from(folders)
      .where(and(eq(folders.id, cur), eq(folders.userId, ctx.userId)))
      .get();
    cur = row?.parentId ?? null;
  }
  return out;
}

/** Ids of `rootId` and everything beneath it. */
function subtreeIds(ctx: AuthedContext, rootId: string): Set<string> {
  const out = new Set<string>([rootId]);
  const stack = [rootId];
  while (stack.length) {
    const cur = stack.pop()!;
    const kids = getDb()
      .select({ id: folders.id })
      .from(folders)
      .where(
        and(
          eq(folders.parentId, cur),
          eq(folders.userId, ctx.userId),
          isNull(folders.deletedAt),
        ),
      )
      .all();
    for (const k of kids) {
      if (!out.has(k.id)) {
        out.add(k.id);
        stack.push(k.id);
      }
    }
  }
  return out;
}

function nextFolderPosition(ctx: AuthedContext, parentId: string | null): number {
  const rows = getDb()
    .select({ position: folders.position })
    .from(folders)
    .where(
      and(
        eq(folders.userId, ctx.userId),
        parentId === null ? isNull(folders.parentId) : eq(folders.parentId, parentId),
        isNull(folders.deletedAt),
      ),
    )
    .all();
  return rows.reduce((m, r) => Math.max(m, r.position), -1) + 1;
}

function nextBookmarkPosition(ctx: AuthedContext, folderId: string | null): number {
  const rows = getDb()
    .select({ position: bookmarks.position })
    .from(bookmarks)
    .where(
      and(
        eq(bookmarks.userId, ctx.userId),
        folderId === null ? isNull(bookmarks.folderId) : eq(bookmarks.folderId, folderId),
        isNull(bookmarks.deletedAt),
      ),
    )
    .all();
  return rows.reduce((m, r) => Math.max(m, r.position), -1) + 1;
}

function assertDestination(ctx: AuthedContext, parentId: string | null) {
  if (!parentId) return;
  const row = getDb()
    .select({ id: folders.id, linkedShareId: folders.linkedShareId, aliasOf: folders.aliasOf })
    .from(folders)
    .where(
      and(
        eq(folders.id, parentId),
        eq(folders.userId, ctx.userId),
        isNull(folders.deletedAt),
      ),
    )
    .get();
  if (!row) throw BadRequest("Carpeta destino no encontrada");
  if (row.linkedShareId) throw BadRequest("No se puede crear dentro de una carpeta enlazada");
  if (row.aliasOf) throw BadRequest("No se puede crear dentro de un enlace simbólico");
}

/** Create a folder symlink inside `parentId`. */
export function createFolderAlias(
  ctx: AuthedContext,
  targetId: string,
  parentId: string | null,
): Folder {
  assertDestination(ctx, parentId);
  const target = getFolder(ctx, targetId); // throws NotFound when missing
  if (target.aliasOf) throw BadRequest("No se puede enlazar a otro enlace simbólico");

  // A link placed inside its own target's subtree would recurse for ever when
  // a panel materialises the tree.
  const inside = subtreeIds(ctx, targetId);
  if (parentId && inside.has(parentId)) {
    throw BadRequest("No se puede enlazar una carpeta dentro de sí misma");
  }
  if (parentId === target.parentId) {
    // Harmless but pointless: the original already lives there.
    if (ancestorsOf(ctx, parentId)[0] === target.parentId) {
      // fall through; duplicates in the same folder are allowed on purpose
    }
  }

  const id = uuidv4();
  getDb()
    .insert(folders)
    .values({
      id,
      userId: ctx.userId,
      parentId,
      // Placeholder copy so the NOT NULL column is satisfied; reads use the
      // live target instead.
      nameCt: sealField(ctx.dek, ctx.userId, "folder.name", target.name),
      descriptionCt: null,
      aliasOf: targetId,
      position: nextFolderPosition(ctx, parentId),
    })
    .run();
  return getFolder(ctx, id);
}

/** Create a bookmark symlink inside `folderId`. */
export function createBookmarkAlias(
  ctx: AuthedContext,
  targetId: string,
  folderId: string | null,
): Bookmark {
  assertDestination(ctx, folderId);
  const target = getBookmark(ctx, targetId);
  if (target.aliasOf) throw BadRequest("No se puede enlazar a otro enlace simbólico");

  const id = uuidv4();
  getDb()
    .insert(bookmarks)
    .values({
      id,
      userId: ctx.userId,
      folderId,
      titleCt: sealField(ctx.dek, ctx.userId, "bookmark.title", target.title),
      urlCt: sealField(ctx.dek, ctx.userId, "bookmark.url", target.url),
      descriptionCt: null,
      urlHash: urlHash(target.url, ctx.userId),
      aliasOf: targetId,
      snapshotStatus: "none",
      position: nextBookmarkPosition(ctx, folderId),
    })
    .run();
  return getBookmark(ctx, id);
}

/** Resolve the real folder behind an alias (or the folder itself). */
export function resolveFolderTarget(ctx: AuthedContext, id: string): Folder {
  const f = getFolder(ctx, id);
  if (!f.aliasOf) return f;
  const target = getDb()
    .select({ id: folders.id })
    .from(folders)
    .where(
      and(
        eq(folders.id, f.aliasOf),
        eq(folders.userId, ctx.userId),
        isNull(folders.deletedAt),
      ),
    )
    .get();
  if (!target) throw NotFound("El destino del enlace ya no existe");
  return getFolder(ctx, target.id);
}
