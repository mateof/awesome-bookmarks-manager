import { and, eq } from "drizzle-orm";
import type { AuthedContext } from "../auth/session.js";
import { getDb } from "../db/client.js";
import { groupMembers } from "../db/schema.js";
import { Forbidden, NotFound } from "../util/errors.js";

/**
 * What a member is allowed to do.
 *
 * Five levels, each strictly containing the one below it:
 *
 *   viewer  read
 *   editor  + change the content
 *   admin   + grant and revoke viewer and editor
 *   super   + grant and revoke admin and super
 *   owner   + cannot be removed by anybody
 *
 * The rule that makes it hold together: **you can only act on somebody
 * strictly below you**, and you can never grant a level at or above your own.
 * Without that, two admins could remove each other, and a super could quietly
 * promote themselves past the owner.
 *
 * One thing crypto does not do here, and it matters: holding the group key
 * lets you *decrypt*. Everything above that line is authorisation the server
 * enforces, not mathematics. A viewer could in principle produce valid
 * ciphertext; what stops them is this file, not their key. Read/no-read is the
 * only boundary the encryption itself draws.
 */

export const ROLES = ["viewer", "editor", "admin", "super", "owner"] as const;
export type GroupRole = (typeof ROLES)[number];

const RANK: Record<GroupRole, number> = {
  viewer: 1,
  editor: 2,
  admin: 3,
  super: 4,
  owner: 5,
};

/**
 * Roles written before this vocabulary existed. "member" was the only
 * non-owner level and it could edit, so it maps to editor rather than viewer:
 * silently demoting existing members on upgrade would be a worse surprise than
 * the reverse.
 */
export function normaliseRole(raw: string | null | undefined): GroupRole {
  if (raw && (ROLES as readonly string[]).includes(raw)) return raw as GroupRole;
  if (raw === "member") return "editor";
  return "viewer";
}

export function rankOf(role: GroupRole): number {
  return RANK[role];
}

export function roleOf(ctx: AuthedContext, groupId: string): GroupRole {
  const row = getDb()
    .select({ role: groupMembers.role })
    .from(groupMembers)
    .where(
      and(eq(groupMembers.groupId, groupId), eq(groupMembers.userId, ctx.userId)),
    )
    .get();
  if (!row) throw NotFound("Group not found");
  return normaliseRole(row.role);
}

export function roleOfUser(groupId: string, userId: string): GroupRole | null {
  const row = getDb()
    .select({ role: groupMembers.role })
    .from(groupMembers)
    .where(and(eq(groupMembers.groupId, groupId), eq(groupMembers.userId, userId)))
    .get();
  return row ? normaliseRole(row.role) : null;
}

/** Throws unless the caller is at least `min` in this group. */
export function requireRole(
  ctx: AuthedContext,
  groupId: string,
  min: GroupRole,
): GroupRole {
  const mine = roleOf(ctx, groupId);
  if (RANK[mine] < RANK[min]) {
    throw Forbidden(`Necesitas permiso de ${min} en este grupo`);
  }
  return mine;
}

export function canEdit(role: GroupRole): boolean {
  return RANK[role] >= RANK.editor;
}

/**
 * Whether `actor` may set `target`'s level to `next`.
 *
 * Both the level being taken away and the level being given must be strictly
 * below the actor's own. Granting your own level is refused too: an admin
 * making another admin creates somebody they can no longer manage, which is
 * the same problem as promoting above yourself, one step later.
 */
export function assertCanAssign(
  actor: GroupRole,
  target: GroupRole | null,
  next: GroupRole,
): void {
  if (next === "owner") {
    throw Forbidden("La propiedad se transfiere, no se concede");
  }
  if (RANK[next] >= RANK[actor]) {
    throw Forbidden("No puedes dar un permiso igual o superior al tuyo");
  }
  if (target && RANK[target] >= RANK[actor]) {
    throw Forbidden("No puedes cambiar el permiso de alguien igual o superior");
  }
}

/** Whether `actor` may remove `target` from the group entirely. */
export function assertCanRemove(actor: GroupRole, target: GroupRole): void {
  if (target === "owner") {
    throw Forbidden("Al propietario no se le puede quitar el grupo");
  }
  if (RANK[target] >= RANK[actor]) {
    throw Forbidden("No puedes expulsar a alguien igual o superior");
  }
  if (RANK[actor] < RANK.admin) {
    throw Forbidden("Necesitas permiso de admin en este grupo");
  }
}

/**
 * Whether losing this much access means the group key has to be replaced.
 *
 * Only when somebody stops being able to read. Demoting an editor to viewer
 * changes nothing they could already decrypt, so rotating then would re-seal
 * every row for no gain; rotation is the expensive part of the whole scheme
 * and this is what keeps it rare.
 */
export function needsRotation(
  before: GroupRole | null,
  after: GroupRole | null,
): boolean {
  return before !== null && after === null;
}
