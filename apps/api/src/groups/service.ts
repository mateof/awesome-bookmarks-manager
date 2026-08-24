import type { Group, GroupMember, SharedItem } from "@awesome-bookmarks/shared";
import { and, desc, eq, inArray, isNull, or } from "drizzle-orm";
import { randomBytes } from "node:crypto";
import { v4 as uuidv4 } from "uuid";
import type { AuthedContext } from "../auth/session.js";
import { ensureUserKeys } from "../auth/userKeys.js";
import { getFolder } from "../folders/service.js";
import { getBookmark } from "../bookmarks/service.js";
import { databaseIdsIn, getDatabase } from "../databases/service.js";
import {
  adoptBookmarkIntoGroup,
  adoptDatabaseIntoGroup,
  adoptFolderIntoGroup,
  folderSubtree,
} from "./adopt.js";
import { groupKeyVersion, resealGroupContent } from "./reseal.js";
import {
  rewrapGrantsForGroup,
  revokeScopeFrom,
  scopeIdsFor,
} from "./scopes.js";
import {
  assertCanAssign,
  assertCanRemove,
  canEdit,
  normaliseRole,
  requireRole,
  roleOf,
  roleOfUser,
  type GroupRole,
} from "./roles.js";
import {
  backfillKeys,
  createGroupKey,
  grantKeyTo,
  groupKeyFor,
  revokeKeysOf,
  rotateGroupKey,
} from "./keys.js";
import { getDb } from "../db/client.js";
import {
  bookmarks,
  databases,
  folders,
  groupInvitations,
  groupMembers,
  groupShares,
  groups,
  users,
} from "../db/schema.js";
import { enqueue } from "../jobs/queue.js";
import { pushNotification } from "../notifications/service.js";
import { BadRequest, Forbidden, NotFound } from "../util/errors.js";
import { deleteShareAssets } from "./assets.js";
import {

  openGroupField,

} from "./encryption.js";

export function listMyGroups(ctx: AuthedContext): Group[] {
  const memberRows = getDb()
    .select({
      groupId: groupMembers.groupId,
      role: groupMembers.role,
    })
    .from(groupMembers)
    .where(eq(groupMembers.userId, ctx.userId))
    .all();
  if (memberRows.length === 0) return [];

  const groupIds = memberRows.map((r) => r.groupId);
  const groupRows = getDb()
    .select()
    .from(groups)
    .where(inArray(groups.id, groupIds))
    .all();
  const memberCounts = countMembersFor(groupIds);
  const roleByGroup = new Map(memberRows.map((r) => [r.groupId, r.role]));

  return groupRows.map((g) => ({
    id: g.id,
    name: g.name,
    description: g.description,
    ownerId: g.ownerId,
    myRole: normaliseRole(roleByGroup.get(g.id)),
    memberCount: memberCounts.get(g.id) ?? 1,
    createdAt: g.createdAt,
  }));
}

function countMembersFor(groupIds: string[]): Map<string, number> {
  const out = new Map<string, number>();
  if (groupIds.length === 0) return out;
  const rows = getDb()
    .select({ groupId: groupMembers.groupId, userId: groupMembers.userId })
    .from(groupMembers)
    .where(inArray(groupMembers.groupId, groupIds))
    .all();
  for (const r of rows) {
    out.set(r.groupId, (out.get(r.groupId) ?? 0) + 1);
  }
  return out;
}

function ensureMember(ctx: AuthedContext, groupId: string) {
  const row = getDb()
    .select({ role: groupMembers.role })
    .from(groupMembers)
    .where(
      and(
        eq(groupMembers.groupId, groupId),
        eq(groupMembers.userId, ctx.userId),
      ),
    )
    .get();
  if (!row) throw NotFound("Group not found");
  return row.role;
}

function ensureOwnerOrAdmin(ctx: AuthedContext, groupId: string) {
  const role = ensureMember(ctx, groupId);
  if (role !== "owner" && role !== "admin") {
    throw Forbidden("Only owner or admin");
  }
}

export function createGroup(
  ctx: AuthedContext,
  input: { name: string; description?: string; recoverable?: boolean },
): Group {
  const id = uuidv4();
  const db = getDb();
  db.transaction(() => {
    db.insert(groups)
      .values({
        id,
        ownerId: ctx.userId,
        name: input.name,
        description: input.description ?? null,
        groupDekWrapped: null,
        recoverable: input.recoverable ?? false,
      })
      .run();
    db.insert(groupMembers)
      .values({ groupId: id, userId: ctx.userId, role: "owner" })
      .run();
  });
  // After the members row exists, so the key is sealed to somebody. Off the
  // transaction because it needs the creator's keypair, which may itself be
  // generated on the way past.
  ensureUserKeys(ctx.userId, ctx.dek);
  createGroupKey(id, input.recoverable ?? false);
  return {
    id,
    name: input.name,
    description: input.description ?? null,
    ownerId: ctx.userId,
    myRole: "owner",
    memberCount: 1,
    createdAt: new Date().toISOString(),
  };
}

export function getGroup(ctx: AuthedContext, id: string): Group {
  const role = ensureMember(ctx, id);
  const row = getDb().select().from(groups).where(eq(groups.id, id)).get();
  if (!row) throw NotFound("Group not found");
  const memberCount = countMembersFor([id]).get(id) ?? 0;
  return {
    id: row.id,
    name: row.name,
    description: row.description,
    ownerId: row.ownerId,
    myRole: role as Group["myRole"],
    memberCount,
    createdAt: row.createdAt,
  };
}

export function updateGroup(
  ctx: AuthedContext,
  id: string,
  input: { name?: string; description?: string | null },
) {
  ensureOwnerOrAdmin(ctx, id);
  const update: Record<string, unknown> = {};
  if (input.name !== undefined) update.name = input.name;
  if (input.description !== undefined) update.description = input.description;
  if (Object.keys(update).length > 0) {
    getDb().update(groups).set(update).where(eq(groups.id, id)).run();
  }
}

export function deleteGroup(ctx: AuthedContext, id: string) {
  const role = ensureMember(ctx, id);
  if (role !== "owner") throw Forbidden("Only the owner can delete a group");
  // The shares cascade with the group; their asset copies are files, so list
  // them before the rows are gone.
  const shares = getDb()
    .select({ id: groupShares.id, sharedBy: groupShares.sharedBy })
    .from(groupShares)
    .where(eq(groupShares.groupId, id))
    .all();
  getDb().delete(groups).where(eq(groups.id, id)).run();
  for (const s of shares) void deleteShareAssets(s.sharedBy, s.id);
}

export function listMembers(ctx: AuthedContext, groupId: string): GroupMember[] {
  ensureMember(ctx, groupId);
  const rows = getDb()
    .select({
      userId: groupMembers.userId,
      role: groupMembers.role,
      joinedAt: groupMembers.joinedAt,
      email: users.email,
    })
    .from(groupMembers)
    .innerJoin(users, eq(users.id, groupMembers.userId))
    .where(eq(groupMembers.groupId, groupId))
    .all();
  return rows.map((r) => ({
    userId: r.userId,
    email: r.email,
    // Normalised so a row written as "member" does not leak an unknown
    // level into the API.
    role: normaliseRole(r.role),
    joinedAt: r.joinedAt,
  }));
}

export function removeMember(
  ctx: AuthedContext,
  groupId: string,
  userId: string,
) {
  const actor = roleOf(ctx, groupId);
  const target = roleOfUser(groupId, userId);
  if (!target) throw NotFound("Member not found");
  assertCanRemove(actor, target);

  getDb()
    .delete(groupMembers)
    .where(
      and(
        eq(groupMembers.groupId, groupId),
        eq(groupMembers.userId, userId),
      ),
    )
    .run();
  revokeKeysOf(groupId, userId);

  // They could read, and now they cannot: the key has to change, or their
  // copy keeps working on everything written from here on.
  //
  // What this does not do, and cannot: it does not un-see what they already
  // saw. Rotation protects the future only.
  const rotated = rotateGroupKey(ctx, groupId);
  resealGroupContent(ctx, groupId, rotated.previous, rotated.current);
  // Scopes this group can reach are sealed with its key. Without this the
  // rotation would quietly cut the remaining members off from everything
  // shared with them through a scope, which is the opposite of the intent.
  rewrapGrantsForGroup(groupId, rotated.previous, rotated.current);
}

/**
 * Change somebody's level.
 *
 * No rotation: every level from viewer up can already decrypt, so moving
 * between them changes what the server allows, not what the key opens.
 */
export function setMemberRole(
  ctx: AuthedContext,
  groupId: string,
  userId: string,
  next: GroupRole,
): void {
  const actor = roleOf(ctx, groupId);
  const target = roleOfUser(groupId, userId);
  if (!target) throw NotFound("Member not found");
  assertCanAssign(actor, target, next);
  getDb()
    .update(groupMembers)
    .set({ role: next })
    .where(
      and(eq(groupMembers.groupId, groupId), eq(groupMembers.userId, userId)),
    )
    .run();
}

export function leaveGroup(ctx: AuthedContext, groupId: string) {
  const role = ensureMember(ctx, groupId);
  if (role === "owner") {
    throw Forbidden("Owner cannot leave; transfer ownership or delete the group");
  }
  getDb()
    .delete(groupMembers)
    .where(
      and(
        eq(groupMembers.groupId, groupId),
        eq(groupMembers.userId, ctx.userId),
      ),
    )
    .run();
}

export interface CreatedInvitation {
  id: string;
  token: string;
  email: string;
  expiresAt: string | null;
  /** True when the invitee had auto-accept on and joined immediately. */
  autoAccepted: boolean;
}

export function inviteMember(
  ctx: AuthedContext,
  groupId: string,
  input: { email: string; expiresInDays: number },
): CreatedInvitation {
  ensureOwnerOrAdmin(ctx, groupId);

  // Accept an email or a nickname; resolve to an existing account if any.
  const raw = input.email.trim();
  const target = getDb()
    .select({
      id: users.id,
      email: users.email,
      autoAccept: users.autoAcceptInvitations,
    })
    .from(users)
    .where(or(eq(users.email, raw.toLowerCase()), eq(users.nickname, raw)))
    .get();
  const inviteEmail = (target?.email ?? raw).toLowerCase();

  const group = getDb()
    .select({ name: groups.name })
    .from(groups)
    .where(eq(groups.id, groupId))
    .get();
  const groupName = group?.name ?? "";
  const inviter = getDb()
    .select({ email: users.email })
    .from(users)
    .where(eq(users.id, ctx.userId))
    .get();

  const id = uuidv4();
  const token = randomBytes(24).toString("base64url");
  const expiresAt = new Date(
    Date.now() + input.expiresInDays * 86_400_000,
  ).toISOString();

  // Auto-join when the invitee opted in from their settings.
  if (target && target.autoAccept) {
    const db = getDb();
    db.transaction(() => {
      db.insert(groupInvitations)
        .values({
          id,
          groupId,
          email: inviteEmail,
          token,
          invitedBy: ctx.userId,
          expiresAt,
          acceptedAt: new Date().toISOString(),
        })
        .run();
      db.insert(groupMembers)
        .values({ groupId, userId: target.id, role: "editor" })
        .onConflictDoNothing()
        .run();
    });
    // Hand them the key straight away. Silently skipped when they have never
    // signed in, and completed by backfillKeys when they do.
    grantKeyTo(groupId, target.id, groupKeyVersion(groupId), groupKeyFor(ctx, groupId));
    pushNotification(target.id, { type: "joined", groupId, groupName });
    return { id, token, email: inviteEmail, expiresAt, autoAccepted: true };
  }

  getDb()
    .insert(groupInvitations)
    .values({
      id,
      groupId,
      email: inviteEmail,
      token,
      invitedBy: ctx.userId,
      expiresAt,
    })
    .run();
  if (target) {
    // Seal the group key to them **now**, before they accept.
    //
    // This is the safe version of handing out a key with the invitation: the
    // key is sealed to their public key, so the row is useless to anybody
    // else and nothing secret travels in the email or the link. It also means
    // accepting is instant, instead of waiting for a member who already has
    // the key to come along and grant it.
    try {
      grantKeyTo(
        groupId,
        target.id,
        groupKeyVersion(groupId),
        groupKeyFor(ctx, groupId),
      );
    } catch {
      /* they have no keypair yet; granted when a member next opens the group */
    }
    pushNotification(target.id, {
      type: "invitation",
      groupId,
      groupName,
      invitedByEmail: inviter?.email,
    });
  }
  return { id, token, email: inviteEmail, expiresAt, autoAccepted: false };
}

export function listMyInvitations(ctx: AuthedContext) {
  const me = getDb()
    .select({ email: users.email })
    .from(users)
    .where(eq(users.id, ctx.userId))
    .get();
  if (!me) throw NotFound("User not found");

  return getDb()
    .select({
      id: groupInvitations.id,
      groupId: groupInvitations.groupId,
      groupName: groups.name,
      email: groupInvitations.email,
      invitedBy: groupInvitations.invitedBy,
      invitedByEmail: users.email,
      expiresAt: groupInvitations.expiresAt,
      acceptedAt: groupInvitations.acceptedAt,
      createdAt: groupInvitations.createdAt,
      token: groupInvitations.token,
    })
    .from(groupInvitations)
    .innerJoin(groups, eq(groups.id, groupInvitations.groupId))
    .innerJoin(users, eq(users.id, groupInvitations.invitedBy))
    .where(
      and(
        eq(groupInvitations.email, me.email),
        isNull(groupInvitations.acceptedAt),
        isNull(groupInvitations.rejectedAt),
      ),
    )
    .all();
}

/** Invitations the sender created for a group, with derived status. */
export function listGroupInvitations(ctx: AuthedContext, groupId: string) {
  ensureOwnerOrAdmin(ctx, groupId);
  const now = Date.now();
  const rows = getDb()
    .select({
      id: groupInvitations.id,
      email: groupInvitations.email,
      token: groupInvitations.token,
      invitedByEmail: users.email,
      expiresAt: groupInvitations.expiresAt,
      acceptedAt: groupInvitations.acceptedAt,
      rejectedAt: groupInvitations.rejectedAt,
      createdAt: groupInvitations.createdAt,
    })
    .from(groupInvitations)
    .innerJoin(users, eq(users.id, groupInvitations.invitedBy))
    .where(eq(groupInvitations.groupId, groupId))
    .orderBy(desc(groupInvitations.createdAt))
    .all();
  return rows.map((r) => ({
    ...r,
    groupId,
    status: r.acceptedAt
      ? ("accepted" as const)
      : r.rejectedAt
        ? ("rejected" as const)
        : r.expiresAt && new Date(r.expiresAt).getTime() < now
          ? ("expired" as const)
          : ("pending" as const),
  }));
}

/** Cancel/delete an unused invitation (owner/admin). Accepted ones stay. */
export function cancelInvitation(
  ctx: AuthedContext,
  groupId: string,
  invId: string,
) {
  ensureOwnerOrAdmin(ctx, groupId);
  const row = getDb()
    .select()
    .from(groupInvitations)
    .where(
      and(eq(groupInvitations.id, invId), eq(groupInvitations.groupId, groupId)),
    )
    .get();
  if (!row) throw NotFound("Invitation not found");
  if (row.acceptedAt) throw BadRequest("Invitation already accepted");
  getDb().delete(groupInvitations).where(eq(groupInvitations.id, invId)).run();
}

/** The invitee declines an invitation. */
export function rejectInvitation(ctx: AuthedContext, token: string) {
  const inv = getDb()
    .select()
    .from(groupInvitations)
    .where(eq(groupInvitations.token, token))
    .get();
  if (!inv) throw NotFound("Invitation not found");
  if (inv.acceptedAt) throw BadRequest("Invitation already used");
  if (inv.rejectedAt) return { ok: true };
  const me = getDb()
    .select({ email: users.email })
    .from(users)
    .where(eq(users.id, ctx.userId))
    .get();
  if (!me || me.email.toLowerCase() !== inv.email.toLowerCase()) {
    throw Forbidden("Invitation is for a different email");
  }
  getDb()
    .update(groupInvitations)
    .set({ rejectedAt: new Date().toISOString() })
    .where(eq(groupInvitations.id, inv.id))
    .run();
  return { ok: true };
}

/** Everything I have shared into my groups (for a central manage view). */
export function listMySharesByMe(ctx: AuthedContext): SharedItem[] {
  const groupIds = getDb()
    .select({ id: groupMembers.groupId })
    .from(groupMembers)
    .where(eq(groupMembers.userId, ctx.userId))
    .all()
    .map((r) => r.id);
  if (groupIds.length === 0) return [];
  return rawShares(ctx, groupIds).filter((s) => s.sharedById === ctx.userId);
}

export function acceptInvitation(ctx: AuthedContext, token: string) {
  const inv = getDb()
    .select()
    .from(groupInvitations)
    .where(eq(groupInvitations.token, token))
    .get();
  if (!inv) throw NotFound("Invitation not found");
  if (inv.acceptedAt) throw BadRequest("Invitation already used");
  if (inv.expiresAt && new Date(inv.expiresAt) < new Date()) {
    throw BadRequest("Invitation expired");
  }
  const me = getDb()
    .select({ email: users.email })
    .from(users)
    .where(eq(users.id, ctx.userId))
    .get();
  if (!me) throw NotFound("User not found");
  if (me.email.toLowerCase() !== inv.email.toLowerCase()) {
    throw Forbidden("Invitation is for a different email");
  }
  const db = getDb();
  db.transaction(() => {
    // INSERT OR IGNORE — user might already be a member
    db.insert(groupMembers)
      .values({ groupId: inv.groupId, userId: ctx.userId, role: "editor" })
      .onConflictDoNothing()
      .run();
    db.update(groupInvitations)
      .set({ acceptedAt: new Date().toISOString() })
      .where(eq(groupInvitations.id, inv.id))
      .run();
  });
  // The accepting user now needs a keypair (they may not have one) and their
  // own sealed copy of the group key. Whoever invited them could not seal it
  // to a public key that did not exist yet, so it happens here.
  ensureUserKeys(ctx.userId, ctx.dek);
  // The inviter could not seal the key to a public key that did not exist
  // yet, so it is completed here, by the person joining, from the copy that
  // the group still has for somebody. Failing this must not undo the join:
  // they are a member either way, and backfillKeys runs again on next access.
  try {
    backfillKeys(ctx, inv.groupId);
  } catch {
    /* no key reachable yet; the next member to open the group grants it */
  }
  return { groupId: inv.groupId };
}

/**
 * Share something with one group.
 *
 * `access` is no longer asked for. What a member may do with shared content is
 * their **role in the group**, and having a second per-share level meant two
 * answers to the same question: an "editor" of the group looking at a share
 * marked "viewer". The column stays for shares created before this, and is
 * written as "editor" so the role is what decides.
 *
 * The trade this makes, stated plainly: a group is now the unit of access. To
 * give the same people read-only access to one folder and write access to
 * another, use two groups. That is how the roles were designed to work, and it
 * is one concept instead of two that contradict each other.
 */
export function shareToGroup(
  ctx: AuthedContext,
  groupId: string,
  input: {
    sourceType: "folder" | "bookmark" | "database";
    sourceId: string;
  },
) {
  requireRole(ctx, groupId, "editor");
  const id = uuidv4();
  getDb()
    .insert(groupShares)
    .values({
      id,
      groupId,
      sharedBy: ctx.userId,
      sourceType: input.sourceType,
      sourceId: input.sourceId,
      access: "editor",
      payloadStatus: "pending",
    })
    .run();

  // Hand the real rows to the group rather than building a copy of them. From
  // here on the members read and write the same rows the owner does, which is
  // what makes an editor's capabilities identical rather than imitated.
  if (input.sourceType === "folder") {
    adoptFolderIntoGroup(ctx, input.sourceId, groupId);
  } else if (input.sourceType === "database") {
    adoptDatabaseIntoGroup(ctx, input.sourceId, groupId);
  } else {
    adoptBookmarkIntoGroup(ctx, input.sourceId, groupId);
  }

  // The materialised payload is still built, because the read-only share views
  // and the panels are fed from it and older clients expect it. It is now a
  // convenience copy, not the source of truth. A database has no payload of
  // that shape: it is reached through its own endpoints.
  if (input.sourceType !== "database") {
    enqueue({
      userId: ctx.userId,
      type: "group_share_seal",
      payload: { groupShareId: id },
    });
  }
  return { id };
}

/**
 * Share the same thing with several groups at once.
 *
 * One call rather than one per group, because the first group's adoption
 * re-seals the rows with *its* key: doing the rest afterwards from a client
 * that has already moved on would find content it can no longer read with the
 * owner's key. Keeping it in one place also makes the answer about what
 * happened a single, honest list.
 *
 * The first group to take a row owns it. A row already belonging to a group is
 * left alone rather than moved, so sharing with a second group gives that
 * group the *share* without stealing the content from the first.
 */
export function shareToGroups(
  ctx: AuthedContext,
  groupIds: string[],
  input: { sourceType: "folder" | "bookmark" | "database"; sourceId: string },
): { groupId: string; id?: string; error?: string }[] {
  return groupIds.map((groupId) => {
    try {
      return { groupId, ...shareToGroup(ctx, groupId, input) };
    } catch (err) {
      // One group failing (no longer a member, not enough permission) must not
      // silently drop the others.
      return {
        groupId,
        error: err instanceof Error ? err.message : String(err),
      };
    }
  });
}

export function listGroupShares(
  ctx: AuthedContext,
  groupId: string,
): SharedItem[] {
  ensureMember(ctx, groupId);
  return rawShares(ctx, [groupId]);
}

function myGroupIds(ctx: AuthedContext): string[] {
  return getDb()
    .select({ id: groupMembers.groupId })
    .from(groupMembers)
    .where(eq(groupMembers.userId, ctx.userId))
    .all()
    .map((r) => r.id);
}

/** Every share in a group I belong to, including the ones I created myself.
 * Used to authorize reading/editing a share's content (any group member may),
 * whereas the "shared with me" list hides my own. */
export function listSharesInMyGroups(ctx: AuthedContext): SharedItem[] {
  const ids = myGroupIds(ctx);
  return ids.length === 0 ? [] : rawShares(ctx, ids);
}

export function listAllSharedWithMe(ctx: AuthedContext): SharedItem[] {
  // Exclude my own shares: they belong under "shared by me", not "with me".
  return listSharesInMyGroups(ctx).filter((s) => s.sharedById !== ctx.userId);
}

/**
 * What a share points at, by name. Null when the source is gone.
 *
 * Read through the ordinary services so it works whichever key seals the row:
 * the sharer's own, a group's, or a key scope's.
 */
function labelForSource(
  ctx: AuthedContext,
  sourceType: string,
  sourceId: string,
): string | null {
  try {
    if (sourceType === "folder") return getFolder(ctx, sourceId).name;
    if (sourceType === "bookmark") return getBookmark(ctx, sourceId).title;
    if (sourceType === "database") return getDatabase(ctx, sourceId).name;
  } catch {
    // Deleted, or not readable by this caller. The payload fallback covers the
    // first; the second is not something to shout about in a listing.
  }
  return null;
}

function rawShares(ctx: AuthedContext, groupIds: string[]): SharedItem[] {
  const roleByGroup = new Map(
    getDb()
      .select({ groupId: groupMembers.groupId, role: groupMembers.role })
      .from(groupMembers)
      .where(eq(groupMembers.userId, ctx.userId))
      .all()
      .map((r) => [r.groupId, normaliseRole(r.role)]),
  );
  const rows = getDb()
    .select({
      id: groupShares.id,
      groupId: groupShares.groupId,
      groupName: groups.name,
      sharedById: groupShares.sharedBy,
      sharedByEmail: users.email,
      sourceType: groupShares.sourceType,
      sourceId: groupShares.sourceId,
      payloadStatus: groupShares.payloadStatus,
      access: groupShares.access,
      rev: groupShares.rev,
      createdAt: groupShares.createdAt,
      updatedAt: groupShares.updatedAt,
      payloadCt: groupShares.payloadCt,
      groupDekWrapped: groups.groupDekWrapped,
    })
    .from(groupShares)
    .innerJoin(groups, eq(groups.id, groupShares.groupId))
    .innerJoin(users, eq(users.id, groupShares.sharedBy))
    .where(inArray(groupShares.groupId, groupIds))
    .all();
  return rows.map((r) => {
    // The name comes from the source row, not from the materialised payload.
    //
    // The payload is built by a background job, so right after sharing it is
    // still "pending" and the list showed "Elemento compartido" for a few
    // seconds. Worse, a payload that failed to seal left it that way for good.
    // The row is there the moment the share is, and reading it is one query.
    let label = labelForSource(ctx, r.sourceType, r.sourceId);
    // Reading the source is the same question as being able to open it, so the
    // answer comes free with the label rather than costing a second lookup.
    const sourceReachable = label !== null;
    if (label === null && r.payloadStatus === "ready" && r.payloadCt) {
      // Falls back to the payload for shares whose source has since been
      // deleted: the copy still says what it was.
      try {
        const dek = groupKeyFor(ctx, r.groupId);
        const content = JSON.parse(
          openGroupField(dek, r.groupId, "share.payload", Buffer.from(r.payloadCt)),
        );
        label = content?.name ?? content?.title ?? null;
      } catch {
        label = null;
      }
    }
    const { payloadCt: _p, groupDekWrapped: _g, ...rest } = r;
    // `access` is no longer the share's stored level; it is what *this* caller
    // may do with it, derived from their role in the group. The clients use it
    // to decide whether to show edit controls, and a stored level would tell
    // them the wrong thing now that the role is the authority.
    const mine = roleByGroup.get(r.groupId);
    return {
      ...rest,
      access: mine && canEdit(mine) ? "editor" : "viewer",
      label,
      sourceReachable,
    } as SharedItem;
  });
}

export function deleteShare(ctx: AuthedContext, shareId: string) {
  const row = getDb()
    .select()
    .from(groupShares)
    .where(eq(groupShares.id, shareId))
    .get();
  if (!row) throw NotFound("Share not found");
  // Only the sharer or a group owner/admin can revoke
  if (row.sharedBy !== ctx.userId) ensureOwnerOrAdmin(ctx, row.groupId);
  getDb().delete(groupShares).where(eq(groupShares.id, shareId)).run();
  // Take the key away, which is what actually ends the access.
  //
  // Deleting the row alone removed the entry from the sharing screen and
  // changed nothing: `visibleTo` matches on `key_scope_id`, so the group kept
  // reading the content through a grant nobody had revoked. A revoke that
  // reports success and revokes nothing is the worst shape a control like this
  // can take, and `revokeScopeFrom` had been written for months without a
  // single caller.
  reconcileGrants(ctx, row.groupId);
  // The share's own copies of the icons/backgrounds go with it; they are the
  // sharer's bytes and count against the sharer's quota.
  void deleteShareAssets(row.sharedBy, shareId);
}

/**
 * Every scope a group can reach through one of its shares.
 *
 * A folder hands over its subtree under one scope, and the tables its notes
 * embed keep scopes of their own, so "what did this share give away" is more
 * than the source row's own column.
 */
function scopesReachedBy(
  ctx: AuthedContext,
  share: { sourceType: string; sourceId: string },
): string[] {
  const db = getDb();
  const out = new Set<string>();
  const add = (id: string | null | undefined) => {
    if (id) out.add(id);
  };
  /** Tables embedded in a note reached their own scope when this was shared. */
  const fromNote = (description: string | null) => {
    for (const id of databaseIdsIn(description)) {
      const d = db
        .select({ keyScopeId: databases.keyScopeId })
        .from(databases)
        .where(eq(databases.id, id))
        .get();
      add(d?.keyScopeId);
    }
  };

  if (share.sourceType === "database") {
    const d = db
      .select({ keyScopeId: databases.keyScopeId })
      .from(databases)
      .where(eq(databases.id, share.sourceId))
      .get();
    add(d?.keyScopeId);
    return [...out];
  }

  if (share.sourceType === "bookmark") {
    const b = db
      .select({ keyScopeId: bookmarks.keyScopeId })
      .from(bookmarks)
      .where(eq(bookmarks.id, share.sourceId))
      .get();
    add(b?.keyScopeId);
    try {
      fromNote(getBookmark(ctx, share.sourceId).description);
    } catch {
      /* unreadable from here; its own share, if any, will account for it */
    }
    return [...out];
  }

  const root = db
    .select({ userId: folders.userId })
    .from(folders)
    .where(eq(folders.id, share.sourceId))
    .get();
  if (!root) return [];
  const ids = folderSubtree(root.userId, share.sourceId);
  for (const f of db
    .select({ id: folders.id, keyScopeId: folders.keyScopeId })
    .from(folders)
    .where(inArray(folders.id, ids))
    .all()) {
    add(f.keyScopeId);
    try {
      fromNote(getFolder(ctx, f.id).description);
    } catch {
      /* see above */
    }
  }
  for (const b of db
    .select({ id: bookmarks.id, keyScopeId: bookmarks.keyScopeId })
    .from(bookmarks)
    .where(inArray(bookmarks.folderId, ids))
    .all()) {
    add(b.keyScopeId);
    try {
      fromNote(getBookmark(ctx, b.id).description);
    } catch {
      /* see above */
    }
  }
  return [...out];
}

/**
 * Drop every grant this group can no longer justify.
 *
 * Recomputing from the shares that remain, rather than working out what one
 * deletion should undo, is what keeps this correct when the same content
 * reaches a group by more than one route: revoking one share of a table that is
 * also shared directly must not cut the other.
 */
function reconcileGrants(ctx: AuthedContext, groupId: string): void {
  const remaining = getDb()
    .select({
      sourceType: groupShares.sourceType,
      sourceId: groupShares.sourceId,
    })
    .from(groupShares)
    .where(eq(groupShares.groupId, groupId))
    .all();
  const justified = new Set<string>();
  for (const s of remaining) {
    for (const scopeId of scopesReachedBy(ctx, s)) justified.add(scopeId);
  }
  for (const scopeId of scopeIdsFor([groupId])) {
    if (!justified.has(scopeId)) revokeScopeFrom(scopeId, groupId);
  }
}
