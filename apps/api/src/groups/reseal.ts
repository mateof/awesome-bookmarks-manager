import { aeadDecrypt, aeadEncrypt } from "@awesome-bookmarks/crypto";
import { eq } from "drizzle-orm";
import type { AuthedContext } from "../auth/session.js";
import { getDb } from "../db/client.js";
import {
  bookmarks,
  databaseColumns,
  databaseRows,
  databaseViews,
  databases,
  folders,
  groupShares,
} from "../db/schema.js";
import { groupMemberKeys } from "../db/schema.js";
import { and } from "drizzle-orm";

/**
 * Re-encrypt everything a group holds after its key changes.
 *
 * Rotation without this would be theatre: the members would have a new key and
 * every existing row would still open with the old one, which the person who
 * was just removed still has.
 *
 * Only content sealed with the group's own key is touched. Content under a key
 * scope keeps its key: the scope survives the rotation and its grant is
 * re-wrapped instead, which is cheaper and leaves the content alone.
 *
 * Done inline rather than as a background job on purpose. A rotation that is
 * "queued" leaves a window in which the removal has been reported as done and
 * the content is still readable by the person removed, and that window is
 * exactly what somebody being removed would try to use. A group's content is
 * bookmarks and notes, not a mailbox, so re-sealing it is a matter of
 * milliseconds.
 */

function reseal(
  previous: Buffer,
  current: Buffer,
  aad: string,
  sealed: Buffer | null,
): Buffer | null {
  if (!sealed) return null;
  try {
    return aeadEncrypt(current, aeadDecrypt(previous, sealed, aad), aad);
  } catch {
    // Already under the new key, or unreadable. Either way, rewriting it with
    // a key that cannot open it would turn a recoverable state into a lost one.
    return sealed;
  }
}

export function resealGroupContent(
  _ctx: AuthedContext,
  groupId: string,
  previous: Buffer,
  current: Buffer,
): void {
  const db = getDb();

  // Materialised share payloads (the read-only copy older shares still use).
  for (const share of db
    .select({ id: groupShares.id, payloadCt: groupShares.payloadCt })
    .from(groupShares)
    .where(eq(groupShares.groupId, groupId))
    .all()) {
    if (!share.payloadCt) continue;
    const next = reseal(
      previous,
      current,
      `${groupId}|share.payload`,
      Buffer.from(share.payloadCt),
    );
    if (next) {
      db.update(groupShares)
        .set({ payloadCt: next })
        .where(eq(groupShares.id, share.id))
        .run();
    }
  }

  // Content the group owns outright: rows whose key_group_id points here.
  for (const f of db
    .select()
    .from(folders)
    .where(eq(folders.keyGroupId, groupId))
    .all()) {
    db.update(folders)
      .set({
        nameCt: reseal(previous, current, `${groupId}|folder.name`, Buffer.from(f.nameCt))!,
        descriptionCt: reseal(
          previous,
          current,
          `${groupId}|folder.description`,
          f.descriptionCt ? Buffer.from(f.descriptionCt) : null,
        ),
      })
      .where(eq(folders.id, f.id))
      .run();
  }

  for (const b of db
    .select()
    .from(bookmarks)
    .where(eq(bookmarks.keyGroupId, groupId))
    .all()) {
    db.update(bookmarks)
      .set({
        titleCt: reseal(previous, current, `${groupId}|bookmark.title`, Buffer.from(b.titleCt))!,
        urlCt: reseal(previous, current, `${groupId}|bookmark.url`, Buffer.from(b.urlCt))!,
        descriptionCt: reseal(
          previous,
          current,
          `${groupId}|bookmark.description`,
          b.descriptionCt ? Buffer.from(b.descriptionCt) : null,
        ),
      })
      .where(eq(bookmarks.id, b.id))
      .run();
  }

  // Databases are shared in their own right, so they rotate with the group
  // that holds them rather than with whatever note happens to embed them.
  for (const d of db
    .select()
    .from(databases)
    .where(eq(databases.keyGroupId, groupId))
    .all()) {
    db.update(databases)
      .set({
        nameCt: reseal(previous, current, `${groupId}|db.name`, Buffer.from(d.nameCt))!,
      })
      .where(eq(databases.id, d.id))
      .run();

    for (const c of db
      .select()
      .from(databaseColumns)
      .where(eq(databaseColumns.databaseId, d.id))
      .all()) {
      db.update(databaseColumns)
        .set({
          nameCt: reseal(previous, current, `${groupId}|db.column`, Buffer.from(c.nameCt))!,
          configCt: reseal(
            previous,
            current,
            `${groupId}|db.columnConfig`,
            c.configCt ? Buffer.from(c.configCt) : null,
          ),
        })
        .where(eq(databaseColumns.id, c.id))
        .run();
    }

    for (const r of db
      .select()
      .from(databaseRows)
      .where(eq(databaseRows.databaseId, d.id))
      .all()) {
      db.update(databaseRows)
        .set({
          cellsCt: reseal(previous, current, `${groupId}|db.cells`, Buffer.from(r.cellsCt))!,
        })
        .where(eq(databaseRows.id, r.id))
        .run();
    }

    for (const v of db
      .select()
      .from(databaseViews)
      .where(eq(databaseViews.databaseId, d.id))
      .all()) {
      db.update(databaseViews)
        .set({
          nameCt: reseal(previous, current, `${groupId}|db.view`, Buffer.from(v.nameCt))!,
          configCt: reseal(
            previous,
            current,
            `${groupId}|db.viewConfig`,
            v.configCt ? Buffer.from(v.configCt) : null,
          ),
        })
        .where(eq(databaseViews.id, v.id))
        .run();
    }
  }
}

/** Which key version a group is on right now. */
export function groupKeyVersion(groupId: string): number {
  const row = getDb()
    .select({ keyVersion: groupMemberKeys.keyVersion })
    .from(groupMemberKeys)
    .where(eq(groupMemberKeys.groupId, groupId))
    .orderBy(groupMemberKeys.keyVersion)
    .all()
    .pop();
  return row?.keyVersion ?? 1;
}

/** True when this user already holds a copy of the group's current key. */
export function hasGroupKey(groupId: string, userId: string): boolean {
  const version = groupKeyVersion(groupId);
  return !!getDb()
    .select({ userId: groupMemberKeys.userId })
    .from(groupMemberKeys)
    .where(
      and(
        eq(groupMemberKeys.groupId, groupId),
        eq(groupMemberKeys.userId, userId),
        eq(groupMemberKeys.keyVersion, version),
      ),
    )
    .get();
}
