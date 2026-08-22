import { generateGroupKey, sealToPublicKey } from "@awesome-bookmarks/crypto";
import { and, eq } from "drizzle-orm";
import type { AuthedContext } from "../auth/session.js";
import { masterUnwrap, masterWrap } from "../auth/encryption.js";
import {
  ensureUserKeys,
  openSealedForUser,
  publicKeyOf,
} from "../auth/userKeys.js";
import { getDb } from "../db/client.js";
import { groupMemberKeys, groupMembers, groups } from "../db/schema.js";
import { Forbidden, NotFound } from "../util/errors.js";

/**
 * Group keys, held by their members rather than by the server.
 *
 * Version 1 of this wrapped the group key with the server's master key alone,
 * which meant anyone holding the database and MASTER_KEY could read every
 * group's shared content. That is now the exception rather than the rule: the
 * key is sealed **to each member's public key**, so at rest it cannot be
 * opened without one of them.
 *
 * What this does not claim: the server still sees plaintext while you are
 * logged in, because it is the server that decrypts to serve your requests.
 * The change is at rest, which is the same promise personal content has always
 * had.
 *
 * A group may opt into keeping a master-wrapped copy as well (`recoverable`).
 * That is a deliberate trade the group makes: recoverable if everyone forgets
 * their password, readable by whoever holds the server. Off by default.
 */

const AAD = (groupId: string, version: number) => `groupkey|${groupId}|v${version}`;

function groupRow(groupId: string) {
  const row = getDb().select().from(groups).where(eq(groups.id, groupId)).get();
  if (!row) throw NotFound("Group not found");
  return row;
}

/** Seal the key to one member, at a given version. Idempotent. */
export function grantKeyTo(
  groupId: string,
  userId: string,
  version: number,
  key: Buffer,
): boolean {
  const pub = publicKeyOf(userId);
  // No public key yet means the account has not made an authenticated request
  // since keypairs existed. Inventing one is not possible (only they can hold
  // the private half), so the grant waits until they show up; `backfillKeys`
  // below is what completes it.
  if (!pub) return false;

  getDb()
    .insert(groupMemberKeys)
    .values({
      groupId,
      userId,
      keyVersion: version,
      wrappedKey: sealToPublicKey(pub, key, AAD(groupId, version)),
    })
    .onConflictDoUpdate({
      target: [
        groupMemberKeys.groupId,
        groupMemberKeys.userId,
        groupMemberKeys.keyVersion,
      ],
      set: {
        wrappedKey: sealToPublicKey(pub, key, AAD(groupId, version)),
      },
    })
    .run();
  return true;
}

/** A brand new group key, sealed for everyone who is currently a member. */
export function createGroupKey(groupId: string, recoverable: boolean): Buffer {
  const key = generateGroupKey();
  const members = getDb()
    .select({ userId: groupMembers.userId })
    .from(groupMembers)
    .where(eq(groupMembers.groupId, groupId))
    .all();
  for (const m of members) grantKeyTo(groupId, m.userId, 1, key);
  getDb()
    .update(groups)
    .set({
      keyVersion: 1,
      recoverable,
      // Only kept when the group asked for it. Otherwise the column stays null
      // and the server genuinely cannot open the group on its own.
      groupDekWrapped: recoverable ? masterWrap(groupId, key) : null,
    })
    .where(eq(groups.id, groupId))
    .run();
  return key;
}

/**
 * The group key, from the point of view of one member.
 *
 * Falls back to the master-wrapped copy when there is one, which covers both
 * recoverable groups and groups created before per-member keys existed. In the
 * latter case it also heals the row on the way past, so the migration happens
 * as people use their groups rather than in one big pass.
 */
export function groupKeyFor(ctx: AuthedContext, groupId: string): Buffer {
  const g = groupRow(groupId);
  const version = g.keyVersion ?? 1;

  const mine = getDb()
    .select({ wrappedKey: groupMemberKeys.wrappedKey })
    .from(groupMemberKeys)
    .where(
      and(
        eq(groupMemberKeys.groupId, groupId),
        eq(groupMemberKeys.userId, ctx.userId),
        eq(groupMemberKeys.keyVersion, version),
      ),
    )
    .get();

  if (mine?.wrappedKey) {
    return openSealedForUser(
      ctx.userId,
      ctx.dek,
      Buffer.from(mine.wrappedKey),
      AAD(groupId, version),
    );
  }

  if (g.groupDekWrapped) {
    const key = masterUnwrap(groupId, Buffer.from(g.groupDekWrapped));
    const member = getDb()
      .select({ userId: groupMembers.userId })
      .from(groupMembers)
      .where(
        and(
          eq(groupMembers.groupId, groupId),
          eq(groupMembers.userId, ctx.userId),
        ),
      )
      .get();
    if (!member) throw Forbidden("No perteneces a este grupo");
    ensureUserKeys(ctx.userId, ctx.dek);
    grantKeyTo(groupId, ctx.userId, version, key);
    return key;
  }

  throw Forbidden("No tienes la clave de este grupo");
}

/**
 * Seal the current key for members who could not receive it earlier, because
 * they had no public key at the time. Cheap enough to call whenever a group is
 * touched, and it is what makes "invite somebody who has never logged in"
 * complete itself.
 */
export function backfillKeys(ctx: AuthedContext, groupId: string): void {
  const g = groupRow(groupId);
  const version = g.keyVersion ?? 1;
  const members = getDb()
    .select({ userId: groupMembers.userId })
    .from(groupMembers)
    .where(eq(groupMembers.groupId, groupId))
    .all();
  const have = new Set(
    getDb()
      .select({ userId: groupMemberKeys.userId })
      .from(groupMemberKeys)
      .where(
        and(
          eq(groupMemberKeys.groupId, groupId),
          eq(groupMemberKeys.keyVersion, version),
        ),
      )
      .all()
      .map((r) => r.userId),
  );
  const missing = members.filter((m) => !have.has(m.userId));
  if (missing.length === 0) return;

  const key = groupKeyFor(ctx, groupId);
  for (const m of missing) grantKeyTo(groupId, m.userId, version, key);
}

export interface RotationResult {
  version: number;
  /** Old key, so the caller can re-seal content that was under it. */
  previous: Buffer;
  current: Buffer;
}

/**
 * Replace the group key and hand the new one to everyone still in the group.
 *
 * Only meaningful when somebody **loses read access**: demoting an editor to
 * viewer changes nothing about what they could already decrypt, so rotating
 * then would be pure cost. Callers decide; this just does it.
 *
 * The honest limit: rotation protects the future only. Whoever was removed had
 * the old key and may have kept a copy of what they could already see. No
 * scheme can undo that, and one that claims to is lying.
 */
export function rotateGroupKey(
  ctx: AuthedContext,
  groupId: string,
): RotationResult {
  const g = groupRow(groupId);
  const previous = groupKeyFor(ctx, groupId);
  const version = (g.keyVersion ?? 1) + 1;
  const current = generateGroupKey();

  const members = getDb()
    .select({ userId: groupMembers.userId })
    .from(groupMembers)
    .where(eq(groupMembers.groupId, groupId))
    .all();
  for (const m of members) grantKeyTo(groupId, m.userId, version, current);

  getDb()
    .update(groups)
    .set({
      keyVersion: version,
      groupDekWrapped: g.recoverable ? masterWrap(groupId, current) : null,
    })
    .where(eq(groups.id, groupId))
    .run();

  // Old versions are dropped rather than kept: the point of rotating is that
  // the person removed cannot open what comes next, and leaving their old
  // wrapped copy around is only useful to them.
  getDb()
    .delete(groupMemberKeys)
    .where(
      and(
        eq(groupMemberKeys.groupId, groupId),
        eq(groupMemberKeys.keyVersion, g.keyVersion ?? 1),
      ),
    )
    .run();

  return { version, previous, current };
}

/** Take a member's copies away. Called as part of removing them. */
export function revokeKeysOf(groupId: string, userId: string): void {
  getDb()
    .delete(groupMemberKeys)
    .where(
      and(
        eq(groupMemberKeys.groupId, groupId),
        eq(groupMemberKeys.userId, userId),
      ),
    )
    .run();
}
