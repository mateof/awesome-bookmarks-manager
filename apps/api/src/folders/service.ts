import type { Folder } from "@awesome-bookmarks/shared";
import { and, asc, eq, inArray, isNull } from "drizzle-orm";
import { v4 as uuidv4 } from "uuid";
import type { AuthedContext } from "../auth/session.js";
import { openField, sealField } from "../auth/encryption.js";
import { getDb, getSqlite } from "../db/client.js";
import { bookmarks, folderTags, folders, tags } from "../db/schema.js";
import { BadRequest, Conflict, NotFound } from "../util/errors.js";
import { sanitizeRichText } from "../util/sanitize.js";
import { type FolderSnapshot, recordVersion } from "../versions/service.js";

function folderSnapshot(f: Folder): FolderSnapshot {
  return {
    name: f.name,
    description: f.description,
    bgColor: f.bgColor ?? null,
    tagIds: f.tagIds,
  };
}

interface FolderRow {
  id: string;
  parentId: string | null;
  nameCt: Buffer;
  descriptionCt: Buffer | null;
  iconBlobPath: string | null;
  imageBlobPath: string | null;
  bgColor: string | null;
  position: number;
  rev: number;
  createdAt: string;
  updatedAt: string;
}

function decode(ctx: AuthedContext, row: FolderRow, tagIds: string[]): Folder {
  return {
    id: row.id,
    parentId: row.parentId,
    name: openField(ctx.dek, ctx.userId, "folder.name", row.nameCt),
    description: row.descriptionCt
      ? openField(ctx.dek, ctx.userId, "folder.description", row.descriptionCt)
      : null,
    iconBlobPath: row.iconBlobPath,
    imageBlobPath: row.imageBlobPath,
    bgColor: row.bgColor,
    position: row.position,
    rev: row.rev,
    tagIds,
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
  };
}

function loadTagIdsForFolders(folderIds: string[]): Map<string, string[]> {
  const out = new Map<string, string[]>();
  if (folderIds.length === 0) return out;
  const rows = getDb()
    .select()
    .from(folderTags)
    .where(inArray(folderTags.folderId, folderIds))
    .all();
  for (const r of rows) {
    const list = out.get(r.folderId) ?? [];
    list.push(r.tagId);
    out.set(r.folderId, list);
  }
  return out;
}

export function listFolders(ctx: AuthedContext): Folder[] {
  const rows = getDb()
    .select()
    .from(folders)
    .where(and(eq(folders.userId, ctx.userId), isNull(folders.deletedAt)))
    .orderBy(asc(folders.position), asc(folders.createdAt))
    .all();
  const tagMap = loadTagIdsForFolders(rows.map((r) => r.id));
  const out: Folder[] = [];
  for (const r of rows) {
    try {
      out.push(
        decode(
          ctx,
          {
            id: r.id,
            parentId: r.parentId,
            nameCt: Buffer.from(r.nameCt),
            descriptionCt: r.descriptionCt ? Buffer.from(r.descriptionCt) : null,
            iconBlobPath: r.iconBlobPath,
            imageBlobPath: r.imageBlobPath,
            bgColor: r.bgColor,
            position: r.position,
            rev: r.rev,
            createdAt: r.createdAt,
            updatedAt: r.updatedAt,
          },
          tagMap.get(r.id) ?? [],
        ),
      );
    } catch (err) {
      console.warn(
        `[folders] skip row ${r.id}: decode failed`,
        err instanceof Error ? err.message : err,
      );
    }
  }
  return out;
}

export function getFolder(ctx: AuthedContext, id: string): Folder {
  const row = getDb()
    .select()
    .from(folders)
    .where(
      and(
        eq(folders.id, id),
        eq(folders.userId, ctx.userId),
        isNull(folders.deletedAt),
      ),
    )
    .get();
  if (!row) throw NotFound("Folder not found");
  const tagIds = loadTagIdsForFolders([id]).get(id) ?? [];
  return decode(
    ctx,
    {
      id: row.id,
      parentId: row.parentId,
      nameCt: Buffer.from(row.nameCt),
      descriptionCt: row.descriptionCt ? Buffer.from(row.descriptionCt) : null,
      iconBlobPath: row.iconBlobPath,
      imageBlobPath: row.imageBlobPath,
      bgColor: row.bgColor,
      position: row.position,
      rev: row.rev,
      createdAt: row.createdAt,
      updatedAt: row.updatedAt,
    },
    tagIds,
  );
}

function ensureParentExists(ctx: AuthedContext, parentId: string | null) {
  if (!parentId) return;
  const row = getDb()
    .select({ id: folders.id })
    .from(folders)
    .where(
      and(
        eq(folders.id, parentId),
        eq(folders.userId, ctx.userId),
        isNull(folders.deletedAt),
      ),
    )
    .get();
  if (!row) throw BadRequest("Parent folder not found");
}

function ensureTagsExist(ctx: AuthedContext, tagIds: string[]) {
  if (tagIds.length === 0) return;
  const rows = getDb()
    .select({ id: tags.id })
    .from(tags)
    .where(and(eq(tags.userId, ctx.userId), inArray(tags.id, tagIds)))
    .all();
  if (rows.length !== tagIds.length) throw BadRequest("Unknown tag");
}

function nextPosition(ctx: AuthedContext, parentId: string | null): number {
  const rows = getDb()
    .select({ position: folders.position })
    .from(folders)
    .where(
      and(
        eq(folders.userId, ctx.userId),
        parentId === null
          ? isNull(folders.parentId)
          : eq(folders.parentId, parentId),
        isNull(folders.deletedAt),
      ),
    )
    .all();
  return rows.reduce((max, r) => Math.max(max, r.position), -1) + 1;
}

export function createFolder(
  ctx: AuthedContext,
  input: {
    parentId?: string | null;
    name: string;
    description?: string;
    tagIds?: string[];
    bgColor?: string | null;
  },
): Folder {
  const parentId = input.parentId ?? null;
  ensureParentExists(ctx, parentId);
  const tagIds = input.tagIds ?? [];
  ensureTagsExist(ctx, tagIds);

  const id = uuidv4();
  const db = getDb();
  const cleanDescription = sanitizeRichText(input.description ?? null);
  db.insert(folders)
    .values({
      id,
      userId: ctx.userId,
      parentId,
      nameCt: sealField(ctx.dek, ctx.userId, "folder.name", input.name),
      descriptionCt: cleanDescription
        ? sealField(ctx.dek, ctx.userId, "folder.description", cleanDescription)
        : null,
      bgColor: input.bgColor ?? null,
      position: nextPosition(ctx, parentId),
    })
    .run();

  if (tagIds.length > 0) {
    db.insert(folderTags)
      .values(tagIds.map((t) => ({ folderId: id, tagId: t })))
      .run();
  }

  const created = getFolder(ctx, id);
  recordVersion(ctx, "folder", id, created.rev, folderSnapshot(created));
  return created;
}

export function updateFolder(
  ctx: AuthedContext,
  id: string,
  input: {
    name?: string;
    description?: string | null;
    tagIds?: string[];
    bgColor?: string | null;
    /** Optimistic concurrency: reject with 409 if the row no longer has it. */
    baseRev?: number;
  },
): Folder {
  const existing = getFolder(ctx, id);
  if (input.tagIds) ensureTagsExist(ctx, input.tagIds);

  const update: Record<string, unknown> = {
    updatedAt: new Date().toISOString(),
    rev: existing.rev + 1,
  };
  if (input.name !== undefined) {
    update.nameCt = sealField(ctx.dek, ctx.userId, "folder.name", input.name);
  }
  if (input.description !== undefined) {
    const clean = sanitizeRichText(input.description);
    update.descriptionCt = clean
      ? sealField(ctx.dek, ctx.userId, "folder.description", clean)
      : null;
  }
  if (input.bgColor !== undefined) {
    update.bgColor = input.bgColor;
  }

  // When baseRev is supplied the update is conditional on the stored rev still
  // matching; a concurrent writer that already bumped it makes this a no-op,
  // which we surface as 409. Row + tag changes are one transaction so a
  // conflict rolls both back.
  const where =
    input.baseRev !== undefined
      ? and(eq(folders.id, existing.id), eq(folders.rev, input.baseRev))
      : eq(folders.id, existing.id);

  const tx = getSqlite().transaction(() => {
    const res = getDb().update(folders).set(update).where(where).run();
    if (input.baseRev !== undefined && res.changes === 0) {
      throw Conflict("stale_write");
    }
    if (input.tagIds) {
      const db = getDb();
      db.delete(folderTags).where(eq(folderTags.folderId, id)).run();
      if (input.tagIds.length > 0) {
        db.insert(folderTags)
          .values(input.tagIds.map((t) => ({ folderId: id, tagId: t })))
          .run();
      }
    }
  });
  tx();

  const updated = getFolder(ctx, id);
  recordVersion(ctx, "folder", id, updated.rev, folderSnapshot(updated));
  return updated;
}

/**
 * Lightweight ownership check that doesn't decode any encrypted field. Used
 * by paths that don't need the folder's plaintext (delete, move, icon set)
 * so a single corrupted blob can't block these operations.
 */
function assertFolderOwnedAndAlive(ctx: AuthedContext, id: string) {
  const row = getDb()
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
  if (!row) throw NotFound("Folder not found");
}

export function moveFolder(
  ctx: AuthedContext,
  id: string,
  newParentId: string | null,
  position: number,
) {
  assertFolderOwnedAndAlive(ctx, id);
  ensureParentExists(ctx, newParentId);
  if (newParentId === id) throw BadRequest("Cannot move into self");
  // Cycle check: walk up newParent's ancestors looking for id.
  let cursor = newParentId;
  const visited = new Set<string>();
  while (cursor) {
    if (cursor === id) throw BadRequest("Cannot move into descendant");
    if (visited.has(cursor)) break;
    visited.add(cursor);
    const row = getDb()
      .select({ parentId: folders.parentId })
      .from(folders)
      .where(eq(folders.id, cursor))
      .get();
    cursor = row?.parentId ?? null;
  }

  getDb()
    .update(folders)
    .set({
      parentId: newParentId,
      position,
      updatedAt: new Date().toISOString(),
    })
    .where(eq(folders.id, id))
    .run();
}

/** All alive folder ids in the subtree rooted at rootId (including itself). */
export function subtreeFolderIds(
  ctx: AuthedContext,
  rootId: string,
): string[] {
  const all = getDb()
    .select({ id: folders.id, parentId: folders.parentId })
    .from(folders)
    .where(and(eq(folders.userId, ctx.userId), isNull(folders.deletedAt)))
    .all();
  const childrenOf = new Map<string, string[]>();
  for (const f of all) {
    if (!f.parentId) continue;
    const list = childrenOf.get(f.parentId) ?? [];
    list.push(f.id);
    childrenOf.set(f.parentId, list);
  }
  const out: string[] = [];
  const queue = [rootId];
  while (queue.length) {
    const cur = queue.shift()!;
    out.push(cur);
    for (const child of childrenOf.get(cur) ?? []) queue.push(child);
  }
  return out;
}

export function deleteFolder(ctx: AuthedContext, id: string) {
  assertFolderOwnedAndAlive(ctx, id);
  const now = new Date().toISOString();
  // Remove the whole subtree so descendants aren't orphaned.
  const subtree = subtreeFolderIds(ctx, id);

  const tx = getSqlite().transaction(() => {
    getDb()
      .update(folders)
      .set({ deletedAt: now })
      .where(and(eq(folders.userId, ctx.userId), inArray(folders.id, subtree)))
      .run();
    getDb()
      .update(bookmarks)
      .set({ deletedAt: now })
      .where(
        and(
          eq(bookmarks.userId, ctx.userId),
          inArray(bookmarks.folderId, subtree),
          isNull(bookmarks.deletedAt),
        ),
      )
      .run();
  });
  tx();
}

export function setFolderIconPath(
  ctx: AuthedContext,
  id: string,
  path: string,
) {
  assertFolderOwnedAndAlive(ctx, id);
  getDb()
    .update(folders)
    .set({ iconBlobPath: path, updatedAt: new Date().toISOString() })
    .where(eq(folders.id, id))
    .run();
}

export function setFolderBgImagePath(
  ctx: AuthedContext,
  id: string,
  path: string | null,
) {
  assertFolderOwnedAndAlive(ctx, id);
  getDb()
    .update(folders)
    .set({ imageBlobPath: path, updatedAt: new Date().toISOString() })
    .where(eq(folders.id, id))
    .run();
}
