import { eq, inArray, or, type SQL } from "drizzle-orm";
import type { AuthedContext } from "../auth/session.js";
import { openField, sealField } from "../auth/encryption.js";
import { getDb } from "../db/client.js";
import { groupMembers } from "../db/schema.js";
import { Forbidden } from "../util/errors.js";
import { groupKeyFor } from "./keys.js";
import {
  canReachScope,
  groupsOfScope,
  scopeIdsFor,
  scopeKeyFor,
} from "./scopes.js";
import { canEdit, normaliseRole, type GroupRole } from "./roles.js";

/**
 * Which key seals a row, and who is allowed to touch it.
 *
 * This is the whole of phase 2 in one idea: a row is sealed either with its
 * owner's DEK or with a group's key, and `key_group_id` says which. Everything
 * else follows. A member of that group opens the row with the group key and
 * writes it back the same way, through the ordinary endpoints, so an editor
 * genuinely does what the owner does rather than an imitation of it.
 *
 * What this replaces: a materialised copy of the owner's content sealed for
 * the group, plus a queue of edits waiting for the owner to log in so they
 * could be replayed into the owner's rows. That queue existed only because the
 * two sides were encrypted with different keys. They no longer are.
 */

export interface Keyed {
  userId: string;
  /** Legacy: sealed with a group's own key, so reachable by that group only. */
  keyGroupId: string | null;
  /** Sealed with a scope key, which any number of groups may hold. */
  keyScopeId?: string | null;
}

/** Group ids this user belongs to, with their level. */
export function myGroupRoles(ctx: AuthedContext): Map<string, GroupRole> {
  const rows = getDb()
    .select({ groupId: groupMembers.groupId, role: groupMembers.role })
    .from(groupMembers)
    .where(eq(groupMembers.userId, ctx.userId))
    .all();
  return new Map(rows.map((r) => [r.groupId, normaliseRole(r.role)]));
}

export function myGroupIds(ctx: AuthedContext): string[] {
  return [...myGroupRoles(ctx).keys()];
}

/**
 * A `where` fragment matching rows this user may read: their own, plus
 * anything owned by a group they are in.
 *
 * Takes the columns rather than the table so folders, bookmarks and databases
 * can all use it without three copies of the same expression.
 */
export function visibleTo(
  ctx: AuthedContext,
  cols: { userId: never | any; keyGroupId: never | any; keyScopeId?: never | any },
): SQL | undefined {
  const groupIds = myGroupIds(ctx);
  if (groupIds.length === 0) return eq(cols.userId, ctx.userId);
  const scopeIds = cols.keyScopeId ? scopeIdsFor(groupIds) : [];
  return or(
    eq(cols.userId, ctx.userId),
    inArray(cols.keyGroupId, groupIds),
    ...(scopeIds.length > 0 ? [inArray(cols.keyScopeId, scopeIds)] : []),
  );
}

/** The key that opens or seals this row, and the AAD scope that goes with it. */
export function keyForRow(
  ctx: AuthedContext,
  row: Keyed,
): { key: Buffer; scope: string } {
  // A scope wins when present: it is the newer mechanism and the only one that
  // can reach more than one group.
  if (row.keyScopeId) {
    return { key: scopeKeyFor(ctx, row.keyScopeId), scope: row.keyScopeId };
  }
  if (row.keyGroupId) {
    return { key: groupKeyFor(ctx, row.keyGroupId), scope: row.keyGroupId };
  }
  return { key: ctx.dek, scope: ctx.userId };
}

export function openRowField(
  ctx: AuthedContext,
  row: Keyed,
  field: string,
  sealed: Buffer,
): string {
  const { key, scope } = keyForRow(ctx, row);
  return openField(key, scope, field, sealed);
}

export function sealRowField(
  ctx: AuthedContext,
  row: Keyed,
  field: string,
  plaintext: string,
): Buffer {
  const { key, scope } = keyForRow(ctx, row);
  return sealField(key, scope, field, plaintext);
}

/**
 * Throws unless this user may change the row.
 *
 * Their own rows: always. A group's rows: only from editor upwards, which is
 * the line the encryption cannot draw for us. A viewer holds the key and could
 * produce valid ciphertext; this is what stops them.
 */
export function assertCanWrite(ctx: AuthedContext, row: Keyed): void {
  const roles = myGroupRoles(ctx);

  if (row.keyScopeId) {
    // Shared with several groups: the level that applies is the best one this
    // person has among the groups that can reach it. Taking the worst would
    // mean joining a read-only group silently took away write access they
    // already had somewhere else.
    const reachable = groupsOfScope(row.keyScopeId).filter((g) => roles.has(g));
    if (reachable.length === 0) {
      throw Forbidden("No perteneces a ningún grupo con este contenido");
    }
    if (!reachable.some((g) => canEdit(roles.get(g)!))) {
      throw Forbidden("Solo puedes ver este contenido");
    }
    return;
  }

  if (!row.keyGroupId) {
    if (row.userId !== ctx.userId) throw Forbidden("No es tuyo");
    return;
  }
  const role = roles.get(row.keyGroupId);
  if (!role) throw Forbidden("No perteneces al grupo de este contenido");
  if (!canEdit(role)) throw Forbidden("Solo puedes ver este contenido");
}

/** Whether the row is readable at all: own, or in one of my groups. */
export function canRead(ctx: AuthedContext, row: Keyed): boolean {
  if (row.userId === ctx.userId) return true;
  const groupIds = [...myGroupRoles(ctx).keys()];
  if (row.keyScopeId) return canReachScope(groupIds, row.keyScopeId);
  return !!row.keyGroupId && groupIds.includes(row.keyGroupId);
}

/** Non-throwing form of `assertCanWrite`, for decorating rows on the way out. */
export function canWriteRow(ctx: AuthedContext, row: Keyed): boolean {
  try {
    assertCanWrite(ctx, row);
    return true;
  } catch {
    return false;
  }
}
