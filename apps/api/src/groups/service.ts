import type { Group, GroupMember, SharedItem } from "@awesome-bookmarks/shared";
import { and, desc, eq, inArray, isNull, or } from "drizzle-orm";
import { randomBytes } from "node:crypto";
import { v4 as uuidv4 } from "uuid";
import type { AuthedContext } from "../auth/session.js";
import { getDb } from "../db/client.js";
import {
  groupInvitations,
  groupMembers,
  groupShares,
  groups,
  users,
} from "../db/schema.js";
import { enqueue } from "../jobs/queue.js";
import { pushNotification } from "../notifications/service.js";
import { BadRequest, Forbidden, NotFound } from "../util/errors.js";
import {
  generateGroupDek,
  openGroupField,
  unwrapGroupDek,
  wrapGroupDek,
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
    myRole: (roleByGroup.get(g.id) ?? "member") as Group["myRole"],
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
  input: { name: string; description?: string },
): Group {
  const id = uuidv4();
  const dek = generateGroupDek();
  const wrapped = wrapGroupDek(id, dek);
  const db = getDb();
  db.transaction(() => {
    db.insert(groups)
      .values({
        id,
        ownerId: ctx.userId,
        name: input.name,
        description: input.description ?? null,
        groupDekWrapped: wrapped,
      })
      .run();
    db.insert(groupMembers)
      .values({ groupId: id, userId: ctx.userId, role: "owner" })
      .run();
  });
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
  getDb().delete(groups).where(eq(groups.id, id)).run();
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
    role: r.role as GroupMember["role"],
    joinedAt: r.joinedAt,
  }));
}

export function removeMember(
  ctx: AuthedContext,
  groupId: string,
  userId: string,
) {
  ensureOwnerOrAdmin(ctx, groupId);
  const target = getDb()
    .select({ role: groupMembers.role })
    .from(groupMembers)
    .where(
      and(
        eq(groupMembers.groupId, groupId),
        eq(groupMembers.userId, userId),
      ),
    )
    .get();
  if (!target) throw NotFound("Member not found");
  if (target.role === "owner") throw Forbidden("Owner cannot be removed");
  getDb()
    .delete(groupMembers)
    .where(
      and(
        eq(groupMembers.groupId, groupId),
        eq(groupMembers.userId, userId),
      ),
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
        .values({ groupId, userId: target.id, role: "member" })
        .onConflictDoNothing()
        .run();
    });
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
  return rawShares(groupIds).filter((s) => s.sharedById === ctx.userId);
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
      .values({ groupId: inv.groupId, userId: ctx.userId, role: "member" })
      .onConflictDoNothing()
      .run();
    db.update(groupInvitations)
      .set({ acceptedAt: new Date().toISOString() })
      .where(eq(groupInvitations.id, inv.id))
      .run();
  });
  return { groupId: inv.groupId };
}

export function shareToGroup(
  ctx: AuthedContext,
  groupId: string,
  input: {
    sourceType: "folder" | "bookmark";
    sourceId: string;
    access?: "viewer" | "editor";
  },
) {
  ensureMember(ctx, groupId);
  const id = uuidv4();
  getDb()
    .insert(groupShares)
    .values({
      id,
      groupId,
      sharedBy: ctx.userId,
      sourceType: input.sourceType,
      sourceId: input.sourceId,
      access: input.access ?? "viewer",
      payloadStatus: "pending",
    })
    .run();
  enqueue({
    userId: ctx.userId,
    type: "group_share_seal",
    payload: { groupShareId: id },
  });
  return { id };
}

export function listGroupShares(
  ctx: AuthedContext,
  groupId: string,
): SharedItem[] {
  ensureMember(ctx, groupId);
  return rawShares([groupId]);
}

export function listAllSharedWithMe(ctx: AuthedContext): SharedItem[] {
  const groupIds = getDb()
    .select({ id: groupMembers.groupId })
    .from(groupMembers)
    .where(eq(groupMembers.userId, ctx.userId))
    .all()
    .map((r) => r.id);
  if (groupIds.length === 0) return [];
  return rawShares(groupIds);
}

function rawShares(groupIds: string[]): SharedItem[] {
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
    let label: string | null = null;
    if (r.payloadStatus === "ready" && r.payloadCt) {
      try {
        const dek = unwrapGroupDek(r.groupId, Buffer.from(r.groupDekWrapped));
        const content = JSON.parse(
          openGroupField(dek, r.groupId, "share.payload", Buffer.from(r.payloadCt)),
        );
        label = content?.name ?? content?.title ?? null;
      } catch {
        label = null;
      }
    }
    const { payloadCt: _p, groupDekWrapped: _g, ...rest } = r;
    return { ...rest, label } as SharedItem;
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
}
