import { aeadDecrypt, aeadEncrypt } from "@awesome-bookmarks/crypto";
import { and, eq, inArray, isNull } from "drizzle-orm";
import type { AuthedContext } from "../auth/session.js";
import { getDb } from "../db/client.js";
import {
  bookmarks,
  databaseColumns,
  databaseRows,
  databaseViews,
  databases,
  folders,
} from "../db/schema.js";
import { databaseIdsIn } from "../databases/service.js";
import { groupKeyFor } from "./keys.js";

/**
 * Hand a subtree over to a group: re-seal every row with the group's key and
 * mark it as the group's.
 *
 * This is the moment the old model and the new one differ. Before, sharing
 * built a *copy* sealed for the group and left the original alone, so an edit
 * by a member had to be queued and replayed into the owner's rows when they
 * next logged in. Now there is one set of rows, sealed with a key everyone in
 * the group holds, and a member's edit is simply the data.
 *
 * Idempotent: rows already belonging to the group are skipped, so re-sharing
 * or adding a subfolder later costs nothing.
 */

function reseal(
  from: Buffer,
  fromScope: string,
  to: Buffer,
  toScope: string,
  field: string,
  sealed: Buffer | null,
): Buffer | null {
  if (!sealed) return null;
  const plain = aeadDecrypt(from, sealed, `${fromScope}|${field}`);
  return aeadEncrypt(to, plain, `${toScope}|${field}`);
}

/** Every folder id in the subtree rooted at `rootId`, the root included. */
export function folderSubtree(ownerId: string, rootId: string): string[] {
  const all = getDb()
    .select({ id: folders.id, parentId: folders.parentId })
    .from(folders)
    .where(and(eq(folders.userId, ownerId), isNull(folders.deletedAt)))
    .all();
  const byParent = new Map<string, string[]>();
  for (const f of all) {
    if (!f.parentId) continue;
    byParent.set(f.parentId, [...(byParent.get(f.parentId) ?? []), f.id]);
  }
  const out: string[] = [];
  const walk = (id: string) => {
    out.push(id);
    for (const child of byParent.get(id) ?? []) walk(child);
  };
  walk(rootId);
  return out;
}

/**
 * Move a folder and everything under it into the group's key.
 *
 * Databases embedded in the notes come too, because a note that references a
 * table the group cannot open is a note with a hole in it. They keep their own
 * `key_group_id`, so a table embedded in two places is shared once and by
 * itself, which is what lets one be shared while another in the same folder is
 * not.
 */
export function adoptFolderIntoGroup(
  ctx: AuthedContext,
  rootFolderId: string,
  groupId: string,
): { folders: number; bookmarks: number; databases: number } {
  const key = groupKeyFor(ctx, groupId);
  const db = getDb();
  const ids = folderSubtree(ctx.userId, rootFolderId);
  let folderCount = 0;
  let bookmarkCount = 0;
  const dbIds = new Set<string>();

  for (const id of ids) {
    const f = db.select().from(folders).where(eq(folders.id, id)).get();
    if (!f || f.keyGroupId === groupId) continue;
    // Only the owner's own rows can be handed over. A subtree that already
    // belongs to a different group is left alone rather than quietly moved.
    if (f.userId !== ctx.userId || f.keyGroupId) continue;

    const description = f.descriptionCt
      ? aeadDecrypt(
          ctx.dek,
          Buffer.from(f.descriptionCt),
          `${ctx.userId}|folder.description`,
        ).toString("utf8")
      : null;
    for (const d of databaseIdsIn(description)) dbIds.add(d);

    db.update(folders)
      .set({
        keyGroupId: groupId,
        nameCt: reseal(ctx.dek, ctx.userId, key, groupId, "folder.name", Buffer.from(f.nameCt))!,
        descriptionCt: reseal(
          ctx.dek,
          ctx.userId,
          key,
          groupId,
          "folder.description",
          f.descriptionCt ? Buffer.from(f.descriptionCt) : null,
        ),
      })
      .where(eq(folders.id, id))
      .run();
    folderCount++;
  }

  for (const b of db
    .select()
    .from(bookmarks)
    .where(
      and(
        eq(bookmarks.userId, ctx.userId),
        inArray(bookmarks.folderId, ids),
        isNull(bookmarks.deletedAt),
      ),
    )
    .all()) {
    if (b.keyGroupId) continue;
    const description = b.descriptionCt
      ? aeadDecrypt(
          ctx.dek,
          Buffer.from(b.descriptionCt),
          `${ctx.userId}|bookmark.description`,
        ).toString("utf8")
      : null;
    for (const d of databaseIdsIn(description)) dbIds.add(d);

    db.update(bookmarks)
      .set({
        keyGroupId: groupId,
        titleCt: reseal(ctx.dek, ctx.userId, key, groupId, "bookmark.title", Buffer.from(b.titleCt))!,
        urlCt: reseal(ctx.dek, ctx.userId, key, groupId, "bookmark.url", Buffer.from(b.urlCt))!,
        descriptionCt: reseal(
          ctx.dek,
          ctx.userId,
          key,
          groupId,
          "bookmark.description",
          b.descriptionCt ? Buffer.from(b.descriptionCt) : null,
        ),
      })
      .where(eq(bookmarks.id, b.id))
      .run();
    bookmarkCount++;
  }

  let databaseCount = 0;
  for (const id of dbIds) {
    if (adoptDatabaseIntoGroup(ctx, id, groupId)) databaseCount++;
  }

  return { folders: folderCount, bookmarks: bookmarkCount, databases: databaseCount };
}

/**
 * Share one database with a group, on its own.
 *
 * Databases are their own thing rather than part of whatever note embeds them:
 * the same table can sit in several folders and bookmarks, and those are not
 * necessarily shared with the same people. Giving it its own `key_group_id`
 * is what lets one table be shared while another in the same note is not.
 *
 * Returns false when there was nothing to do.
 */
export function adoptDatabaseIntoGroup(
  ctx: AuthedContext,
  databaseId: string,
  groupId: string,
): boolean {
  const db = getDb();
  const row = db.select().from(databases).where(eq(databases.id, databaseId)).get();
  if (!row || row.keyGroupId === groupId) return false;
  if (row.userId !== ctx.userId || row.keyGroupId) return false;

  const key = groupKeyFor(ctx, groupId);
  const move = <T>(
    field: string,
    sealed: Buffer | null,
  ): Buffer | null => reseal(ctx.dek, ctx.userId, key, groupId, field, sealed);

  db.update(databases)
    .set({
      keyGroupId: groupId,
      nameCt: move("db.name", Buffer.from(row.nameCt))!,
    })
    .where(eq(databases.id, databaseId))
    .run();

  for (const c of db
    .select()
    .from(databaseColumns)
    .where(eq(databaseColumns.databaseId, databaseId))
    .all()) {
    db.update(databaseColumns)
      .set({
        nameCt: move("db.column", Buffer.from(c.nameCt))!,
        configCt: move("db.columnConfig", c.configCt ? Buffer.from(c.configCt) : null),
      })
      .where(eq(databaseColumns.id, c.id))
      .run();
  }
  for (const r of db
    .select()
    .from(databaseRows)
    .where(eq(databaseRows.databaseId, databaseId))
    .all()) {
    db.update(databaseRows)
      .set({ cellsCt: move("db.cells", Buffer.from(r.cellsCt))! })
      .where(eq(databaseRows.id, r.id))
      .run();
  }
  for (const v of db
    .select()
    .from(databaseViews)
    .where(eq(databaseViews.databaseId, databaseId))
    .all()) {
    db.update(databaseViews)
      .set({
        nameCt: move("db.view", Buffer.from(v.nameCt))!,
        configCt: move("db.viewConfig", v.configCt ? Buffer.from(v.configCt) : null),
      })
      .where(eq(databaseViews.id, v.id))
      .run();
  }
  return true;
}

/** A single bookmark shared on its own, with any database its note embeds. */
export function adoptBookmarkIntoGroup(
  ctx: AuthedContext,
  bookmarkId: string,
  groupId: string,
): boolean {
  const db = getDb();
  const b = db.select().from(bookmarks).where(eq(bookmarks.id, bookmarkId)).get();
  if (!b || b.keyGroupId === groupId) return false;
  if (b.userId !== ctx.userId || b.keyGroupId) return false;

  const key = groupKeyFor(ctx, groupId);
  const description = b.descriptionCt
    ? aeadDecrypt(
        ctx.dek,
        Buffer.from(b.descriptionCt),
        `${ctx.userId}|bookmark.description`,
      ).toString("utf8")
    : null;

  db.update(bookmarks)
    .set({
      keyGroupId: groupId,
      titleCt: reseal(ctx.dek, ctx.userId, key, groupId, "bookmark.title", Buffer.from(b.titleCt))!,
      urlCt: reseal(ctx.dek, ctx.userId, key, groupId, "bookmark.url", Buffer.from(b.urlCt))!,
      descriptionCt: reseal(
        ctx.dek,
        ctx.userId,
        key,
        groupId,
        "bookmark.description",
        b.descriptionCt ? Buffer.from(b.descriptionCt) : null,
      ),
    })
    .where(eq(bookmarks.id, bookmarkId))
    .run();

  for (const d of databaseIdsIn(description)) {
    adoptDatabaseIntoGroup(ctx, d, groupId);
  }
  return true;
}
