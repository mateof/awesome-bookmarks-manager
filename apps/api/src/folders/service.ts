import type { Folder } from "@awesome-bookmarks/shared";
import { and, asc, eq, inArray, isNull } from "drizzle-orm";
import { v4 as uuidv4 } from "uuid";
import type { AuthedContext } from "../auth/session.js";
import { openField, sealField } from "../auth/encryption.js";
import { getDb } from "../db/client.js";
import { folderTags, folders, tags } from "../db/schema.js";
import { BadRequest, NotFound } from "../util/errors.js";
import { sanitizeRichText } from "../util/sanitize.js";

interface FolderRow {
  id: string;
  parentId: string | null;
  nameCt: Buffer;
  descriptionCt: Buffer | null;
  iconBlobPath: string | null;
  imageBlobPath: string | null;
  position: number;
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
    position: row.position,
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
            position: r.position,
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
      position: row.position,
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
      position: nextPosition(ctx, parentId),
    })
    .run();

  if (tagIds.length > 0) {
    db.insert(folderTags)
      .values(tagIds.map((t) => ({ folderId: id, tagId: t })))
      .run();
  }

  return getFolder(ctx, id);
}

export function updateFolder(
  ctx: AuthedContext,
  id: string,
  input: {
    name?: string;
    description?: string | null;
    tagIds?: string[];
  },
): Folder {
  const existing = getFolder(ctx, id);
  const update: Record<string, unknown> = {
    updatedAt: new Date().toISOString(),
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
  getDb().update(folders).set(update).where(eq(folders.id, existing.id)).run();

  if (input.tagIds) {
    ensureTagsExist(ctx, input.tagIds);
    const db = getDb();
    db.delete(folderTags).where(eq(folderTags.folderId, id)).run();
    if (input.tagIds.length > 0) {
      db.insert(folderTags)
        .values(input.tagIds.map((t) => ({ folderId: id, tagId: t })))
        .run();
    }
  }

  return getFolder(ctx, id);
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

export function deleteFolder(ctx: AuthedContext, id: string) {
  assertFolderOwnedAndAlive(ctx, id);
  getDb()
    .update(folders)
    .set({ deletedAt: new Date().toISOString() })
    .where(eq(folders.id, id))
    .run();
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
