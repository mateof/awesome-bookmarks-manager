import type { Group, GroupMember, SharedItem } from "@awesome-bookmarks/shared";
import { and, eq, inArray, isNull } from "drizzle-orm";
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
import { BadRequest, Forbidden, NotFound } from "../util/errors.js";
import { generateGroupDek, wrapGroupDek } from "./encryption.js";

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
}

export function inviteMember(
  ctx: AuthedContext,
  groupId: string,
  input: { email: string; expiresInDays: number },
): CreatedInvitation {
  ensureOwnerOrAdmin(ctx, groupId);
  const id = uuidv4();
  const token = randomBytes(24).toString("base64url");
  const expiresAt = new Date(
    Date.now() + input.expiresInDays * 86_400_000,
  ).toISOString();
  getDb()
    .insert(groupInvitations)
    .values({
      id,
      groupId,
      email: input.email.toLowerCase(),
      token,
      invitedBy: ctx.userId,
      expiresAt,
    })
    .run();
  return { id, token, email: input.email, expiresAt };
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
      ),
    )
    .all();
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
  input: { sourceType: "folder" | "bookmark"; sourceId: string },
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
  return getDb()
    .select({
      id: groupShares.id,
      groupId: groupShares.groupId,
      groupName: groups.name,
      sharedById: groupShares.sharedBy,
      sharedByEmail: users.email,
      sourceType: groupShares.sourceType,
      sourceId: groupShares.sourceId,
      payloadStatus: groupShares.payloadStatus,
      createdAt: groupShares.createdAt,
      updatedAt: groupShares.updatedAt,
    })
    .from(groupShares)
    .innerJoin(groups, eq(groups.id, groupShares.groupId))
    .innerJoin(users, eq(users.id, groupShares.sharedBy))
    .where(inArray(groupShares.groupId, groupIds))
    .all() as SharedItem[];
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
