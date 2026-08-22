import {
  aeadDecrypt,
  aeadEncrypt,
  generateGroupKey,
} from "@awesome-bookmarks/crypto";
import { and, eq, inArray } from "drizzle-orm";
import { randomUUID } from "node:crypto";
import type { AuthedContext } from "../auth/session.js";
import { getDb } from "../db/client.js";
import { groups, keyScopeGrants, keyScopes } from "../db/schema.js";
import { Forbidden, NotFound } from "../util/errors.js";
import { groupKeyFor } from "./keys.js";

/**
 * Key scopes: the key a shared item is sealed with, held by every group that
 * may read it.
 *
 * Sealing shared content with the *group's* key works right up until the same
 * item is shared with a second group. A key cannot be narrowed to a subset, so
 * handing group B the key of group A would hand B everything A owns. The scope
 * is the level that was missing: the content gets a key of its own, and each
 * group holds that key wrapped with theirs.
 *
 * The payoff is that widening the audience is cheap. Adding a group is one
 * small row; the content's key does not change, so nothing is re-encrypted.
 */

const AAD = (scopeId: string, groupId: string) => `scope|${scopeId}|${groupId}`;

/** Scope ids readable by this user, via any group they belong to. */
export function scopeIdsFor(groupIds: string[]): string[] {
  if (groupIds.length === 0) return [];
  return getDb()
    .select({ scopeId: keyScopeGrants.scopeId })
    .from(keyScopeGrants)
    .where(inArray(keyScopeGrants.groupId, groupIds))
    .all()
    .map((r) => r.scopeId);
}

/**
 * The scope's key, from the point of view of this user.
 *
 * Any group they are in that holds a grant will do; which one is irrelevant,
 * they all unwrap the same key.
 */
export function scopeKeyFor(ctx: AuthedContext, scopeId: string): Buffer {
  const grants = getDb()
    .select()
    .from(keyScopeGrants)
    .where(eq(keyScopeGrants.scopeId, scopeId))
    .all();
  if (grants.length === 0) throw NotFound("Key scope not found");

  for (const grant of grants) {
    let groupKey: Buffer;
    try {
      groupKey = groupKeyFor(ctx, grant.groupId);
    } catch {
      // Not in that group, or no key for it. Try the next grant rather than
      // failing: a scope shared with three groups only needs one of them.
      continue;
    }
    try {
      return aeadDecrypt(
        groupKey,
        Buffer.from(grant.wrappedKey),
        AAD(scopeId, grant.groupId),
      );
    } catch {
      // A grant wrapped with a group key that has since rotated. Rotation
      // re-wraps them, so this is a stale row rather than a normal state; skip
      // it instead of taking the whole read down.
      continue;
    }
  }
  throw Forbidden("No tienes acceso a este contenido");
}

/** Whether the user can reach this scope at all. */
export function canReachScope(groupIds: string[], scopeId: string): boolean {
  if (groupIds.length === 0) return false;
  return !!getDb()
    .select({ scopeId: keyScopeGrants.scopeId })
    .from(keyScopeGrants)
    .where(
      and(
        eq(keyScopeGrants.scopeId, scopeId),
        inArray(keyScopeGrants.groupId, groupIds),
      ),
    )
    .get();
}

function currentGroupKeyVersion(groupId: string): number {
  const row = getDb()
    .select({ keyVersion: groups.keyVersion })
    .from(groups)
    .where(eq(groups.id, groupId))
    .get();
  return row?.keyVersion ?? 1;
}

/** Seal a scope key for one group. Idempotent. */
export function grantScopeTo(
  ctx: AuthedContext,
  scopeId: string,
  groupId: string,
  scopeKey: Buffer,
): void {
  const groupKey = groupKeyFor(ctx, groupId);
  const wrapped = aeadEncrypt(groupKey, scopeKey, AAD(scopeId, groupId));
  const version = currentGroupKeyVersion(groupId);
  getDb()
    .insert(keyScopeGrants)
    .values({ scopeId, groupId, wrappedKey: wrapped, groupKeyVersion: version })
    .onConflictDoUpdate({
      target: [keyScopeGrants.scopeId, keyScopeGrants.groupId],
      set: { wrappedKey: wrapped, groupKeyVersion: version },
    })
    .run();
}

/** A brand new scope with a fresh key, already granted to one group. */
export function createScope(
  ctx: AuthedContext,
  groupId: string,
): { scopeId: string; key: Buffer } {
  const scopeId = randomUUID();
  const key = generateGroupKey();
  getDb().insert(keyScopes).values({ id: scopeId, userId: ctx.userId }).run();
  grantScopeTo(ctx, scopeId, groupId, key);
  return { scopeId, key };
}

/** Take a group's copy away, e.g. when a share is revoked. */
export function revokeScopeFrom(scopeId: string, groupId: string): void {
  getDb()
    .delete(keyScopeGrants)
    .where(
      and(
        eq(keyScopeGrants.scopeId, scopeId),
        eq(keyScopeGrants.groupId, groupId),
      ),
    )
    .run();
}

/**
 * Re-wrap every grant a group holds, after that group's key changes.
 *
 * Without this, rotating a group's key would silently cut its members off from
 * every scope shared with them: the grants are sealed with the old key and
 * nothing else would notice.
 */
export function rewrapGrantsForGroup(
  groupId: string,
  previousGroupKey: Buffer,
  currentGroupKey: Buffer,
): number {
  const rows = getDb()
    .select()
    .from(keyScopeGrants)
    .where(eq(keyScopeGrants.groupId, groupId))
    .all();
  let done = 0;
  for (const grant of rows) {
    try {
      const scopeKey = aeadDecrypt(
        previousGroupKey,
        Buffer.from(grant.wrappedKey),
        AAD(grant.scopeId, groupId),
      );
      getDb()
        .update(keyScopeGrants)
        .set({
          wrappedKey: aeadEncrypt(
            currentGroupKey,
            scopeKey,
            AAD(grant.scopeId, groupId),
          ),
        })
        .where(
          and(
            eq(keyScopeGrants.scopeId, grant.scopeId),
            eq(keyScopeGrants.groupId, groupId),
          ),
        )
        .run();
      done++;
    } catch {
      // Already under the new key, or unreadable. Rewriting it with a key that
      // cannot open it would turn a recoverable state into a lost one.
    }
  }
  return done;
}

/** Which groups can read a scope, for display. */
export function groupsOfScope(scopeId: string): string[] {
  return getDb()
    .select({ groupId: keyScopeGrants.groupId })
    .from(keyScopeGrants)
    .where(eq(keyScopeGrants.scopeId, scopeId))
    .all()
    .map((r) => r.groupId);
}
