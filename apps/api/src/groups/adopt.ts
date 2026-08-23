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
import {
  canReachScope,
  createScope,
  grantScopeTo,
  scopeKeyFor,
} from "./scopes.js";
import { myGroupIds } from "./scope.js";

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

export interface Destination {
  scopeId: string;
  key: Buffer;
  /** False when the content is already under this scope: nothing to re-seal. */
  fresh: boolean;
}

/**
 * Where a piece of content should end up when shared with `groupId`.
 *
 * Three cases, and only the first costs anything:
 *
 * - **Personal.** A new scope is created and the content is re-sealed into it.
 * - **Already in a scope.** The group is granted that scope's key. The content
 *   is untouched, which is the whole reason scopes exist: widening the
 *   audience must not mean re-encrypting everything again.
 * - **Legacy, sealed with a group's own key.** Promoted to a scope on the way
 *   past, so it stops being reachable by exactly one group.
 */
export function destinationFor(
  ctx: AuthedContext,
  row: { keyScopeId?: string | null; keyGroupId?: string | null },
  groupId: string,
): Destination {
  if (row.keyScopeId) {
    if (canReachScope([groupId], row.keyScopeId)) {
      return { scopeId: row.keyScopeId, key: scopeKeyFor(ctx, row.keyScopeId), fresh: false };
    }
    const key = scopeKeyFor(ctx, row.keyScopeId);
    grantScopeTo(ctx, row.keyScopeId, groupId, key);
    return { scopeId: row.keyScopeId, key, fresh: false };
  }
  const made = createScope(ctx, groupId);
  return { scopeId: made.scopeId, key: made.key, fresh: true };
}

/** The key a row is currently sealed with, whatever mechanism it uses. */
function currentKeyOf(
  ctx: AuthedContext,
  row: { keyScopeId?: string | null; keyGroupId?: string | null },
): { key: Buffer; scope: string } {
  if (row.keyScopeId) {
    return { key: scopeKeyFor(ctx, row.keyScopeId), scope: row.keyScopeId };
  }
  if (row.keyGroupId) {
    return { key: groupKeyFor(ctx, row.keyGroupId), scope: row.keyGroupId };
  }
  return { key: ctx.dek, scope: ctx.userId };
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
/**
 * The content is already in a scope this group now holds. Nothing to re-seal;
 * only the databases the notes embed need a grant of their own, because they
 * carry their own scope rather than the folder's.
 */
function grantOnly(
  ctx: AuthedContext,
  folderIds: string[],
  groupId: string,
): { folders: number; bookmarks: number; databases: number } {
  const db = getDb();
  const dbIds = new Set<string>();
  const collect = (
    sealed: Buffer | null,
    row: { keyScopeId?: string | null; keyGroupId?: string | null },
    field: string,
  ) => {
    if (!sealed) return;
    try {
      const from = currentKeyOf(ctx, row);
      for (const d of databaseIdsIn(
        aeadDecrypt(from.key, sealed, `${from.scope}|${field}`).toString("utf8"),
      )) {
        dbIds.add(d);
      }
    } catch {
      /* unreadable here; the grant for its own scope will come from elsewhere */
    }
  };

  for (const id of folderIds) {
    const f = db.select().from(folders).where(eq(folders.id, id)).get();
    if (f) collect(f.descriptionCt ? Buffer.from(f.descriptionCt) : null, f, "folder.description");
  }
  for (const b of db
    .select()
    .from(bookmarks)
    .where(and(inArray(bookmarks.folderId, folderIds), isNull(bookmarks.deletedAt)))
    .all()) {
    collect(b.descriptionCt ? Buffer.from(b.descriptionCt) : null, b, "bookmark.description");
  }

  let databases = 0;
  for (const id of dbIds) if (adoptDatabaseIntoGroup(ctx, id, groupId)) databases++;
  return { folders: 0, bookmarks: 0, databases };
}

export function adoptFolderIntoGroup(
  ctx: AuthedContext,
  rootFolderId: string,
  groupId: string,
): { folders: number; bookmarks: number; databases: number } {
  const db = getDb();
  const ids = folderSubtree(ctx.userId, rootFolderId);
  // Decided from the root: a subtree moves as one, so its children inherit
  // whatever the root ends up in rather than each opening its own scope.
  const root = db.select().from(folders).where(eq(folders.id, rootFolderId)).get();
  if (!root) return { folders: 0, bookmarks: 0, databases: 0 };
  const dest = destinationFor(ctx, root, groupId);
  const key = dest.key;
  // Already shared? Then most of the loop below will do nothing, because it
  // skips every row that is already on the destination scope. It is still run,
  // and that is the point: **sharing repairs the subtree**.
  //
  // A row can end up inside a shared folder still sealed with its owner's own
  // key — the HTML importer did that until v0.83.1, and symlink creation until
  // v0.86.0. That failure is invisible rather than loud: the owner reads such a
  // row perfectly and the group cannot see it at all, so nobody reports it.
  // Walking anyway makes "share it again" the fix, which is a thing a person
  // can do without being told about key scopes.
  //
  // Rows belonging to *other* members are left alone: only their owner holds
  // what is needed to re-seal them. The databases their notes embed still need
  // granting, which is what this collects.
  const granted = dest.fresh ? null : grantOnly(ctx, ids, groupId);
  let folderCount = 0;
  let bookmarkCount = 0;
  const dbIds = new Set<string>();

  for (const id of ids) {
    const f = db.select().from(folders).where(eq(folders.id, id)).get();
    if (!f || f.keyScopeId === dest.scopeId) continue;
    if (f.userId !== ctx.userId) continue;

    const from = currentKeyOf(ctx, f);
    const description = f.descriptionCt
      ? aeadDecrypt(
          from.key,
          Buffer.from(f.descriptionCt),
          `${from.scope}|folder.description`,
        ).toString("utf8")
      : null;
    for (const d of databaseIdsIn(description)) dbIds.add(d);

    db.update(folders)
      .set({
        keyGroupId: null,
        keyScopeId: dest.scopeId,
        nameCt: reseal(from.key, from.scope, key, dest.scopeId, "folder.name", Buffer.from(f.nameCt))!,
        descriptionCt: reseal(
          from.key,
          from.scope,
          key,
          dest.scopeId,
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
    if (b.keyScopeId === dest.scopeId) continue;
    const from = currentKeyOf(ctx, b);
    const description = b.descriptionCt
      ? aeadDecrypt(
          from.key,
          Buffer.from(b.descriptionCt),
          `${from.scope}|bookmark.description`,
        ).toString("utf8")
      : null;
    for (const d of databaseIdsIn(description)) dbIds.add(d);

    db.update(bookmarks)
      .set({
        keyGroupId: null,
        keyScopeId: dest.scopeId,
        titleCt: reseal(from.key, from.scope, key, dest.scopeId, "bookmark.title", Buffer.from(b.titleCt))!,
        urlCt: reseal(from.key, from.scope, key, dest.scopeId, "bookmark.url", Buffer.from(b.urlCt))!,
        descriptionCt: reseal(
          from.key,
          from.scope,
          key,
          dest.scopeId,
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

  return {
    folders: folderCount,
    bookmarks: bookmarkCount,
    databases: databaseCount + (granted?.databases ?? 0),
  };
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
  if (!row) return false;
  // Sharing somebody else's table is not a thing you can do by embedding it.
  if (row.userId !== ctx.userId && !row.keyScopeId) return false;

  const dest = destinationFor(ctx, row, groupId);
  if (!dest.fresh) {
    // Already in a scope the group now holds: the grant is the whole job.
    return row.keyScopeId !== dest.scopeId;
  }

  const from = currentKeyOf(ctx, row);
  const key = dest.key;
  const move = (field: string, sealed: Buffer | null): Buffer | null =>
    reseal(from.key, from.scope, key, dest.scopeId, field, sealed);

  db.update(databases)
    .set({
      keyGroupId: null,
      keyScopeId: dest.scopeId,
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
  if (!b) return false;
  if (b.userId !== ctx.userId && !b.keyScopeId) return false;

  const dest = destinationFor(ctx, b, groupId);
  const from = currentKeyOf(ctx, b);
  const key = dest.key;
  const description = b.descriptionCt
    ? aeadDecrypt(
        from.key,
        Buffer.from(b.descriptionCt),
        `${from.scope}|bookmark.description`,
      ).toString("utf8")
    : null;

  if (!dest.fresh && b.keyScopeId === dest.scopeId) {
    for (const d of databaseIdsIn(description)) {
      adoptDatabaseIntoGroup(ctx, d, groupId);
    }
    return true;
  }

  db.update(bookmarks)
    .set({
      keyGroupId: null,
      keyScopeId: dest.scopeId,
      titleCt: reseal(from.key, from.scope, key, dest.scopeId, "bookmark.title", Buffer.from(b.titleCt))!,
      urlCt: reseal(from.key, from.scope, key, dest.scopeId, "bookmark.url", Buffer.from(b.urlCt))!,
      descriptionCt: reseal(
        from.key,
        from.scope,
        key,
        dest.scopeId,
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
