import { z } from "zod";

/**
 * The five levels, lowest first. Each contains the one below it.
 *
 * "member" from before this vocabulary existed is normalised to "editor" on
 * the way out of the server: it could edit, and silently demoting people on an
 * upgrade would be the worse surprise.
 */
export const GroupRoleSchema = z.enum([
  "viewer",
  "editor",
  "admin",
  "super",
  "owner",
]);

/** Order used to decide who may act on whom. */
export const GROUP_ROLE_RANK: Record<GroupRole, number> = {
  viewer: 1,
  editor: 2,
  admin: 3,
  super: 4,
  owner: 5,
};

/** Levels one may grant: strictly below your own, and never `owner`. */
export function assignableRoles(mine: GroupRole): GroupRole[] {
  return (["viewer", "editor", "admin", "super"] as GroupRole[]).filter(
    (r) => GROUP_ROLE_RANK[r] < GROUP_ROLE_RANK[mine],
  );
}
export type GroupRole = z.infer<typeof GroupRoleSchema>;

/** A database is shareable in its own right, not only as part of a note. */
export const ShareSourceTypeSchema = z.enum(["folder", "bookmark", "database"]);
export type ShareSourceType = z.infer<typeof ShareSourceTypeSchema>;

export const GroupSchema = z.object({
  id: z.string().uuid(),
  name: z.string(),
  description: z.string().nullable(),
  ownerId: z.string().uuid(),
  myRole: GroupRoleSchema,
  memberCount: z.number().int(),
  createdAt: z.string(),
});
export type Group = z.infer<typeof GroupSchema>;

export const GroupMemberSchema = z.object({
  userId: z.string().uuid(),
  email: z.string(),
  role: GroupRoleSchema,
  joinedAt: z.string(),
});
export type GroupMember = z.infer<typeof GroupMemberSchema>;

export const GroupInvitationSchema = z.object({
  id: z.string().uuid(),
  groupId: z.string().uuid(),
  groupName: z.string(),
  email: z.string(),
  invitedBy: z.string().uuid(),
  invitedByEmail: z.string(),
  expiresAt: z.string().nullable(),
  acceptedAt: z.string().nullable(),
  createdAt: z.string(),
});
export type GroupInvitation = z.infer<typeof GroupInvitationSchema>;

export const CreateGroupBodySchema = z.object({
  name: z.string().min(1).max(128),
  description: z.string().max(2000).optional(),
});
export type CreateGroupBody = z.infer<typeof CreateGroupBodySchema>;

export const UpdateGroupBodySchema = z.object({
  name: z.string().min(1).max(128).optional(),
  description: z.string().max(2000).nullable().optional(),
});
export type UpdateGroupBody = z.infer<typeof UpdateGroupBodySchema>;

export const InviteMemberBodySchema = z.object({
  // Email or nickname of the invitee; resolved to an account server-side.
  email: z.string().min(1).max(254),
  expiresInDays: z.coerce.number().int().min(1).max(365).default(30),
});
export type InviteMemberBody = z.infer<typeof InviteMemberBodySchema>;

export const AccessLevelSchema = z.enum(["viewer", "editor"]);
export type AccessLevel = z.infer<typeof AccessLevelSchema>;

/**
 * Share something with one or more groups.
 *
 * No access level: what a member may do is their **role in the group**, and
 * asking again per share meant two answers to the same question. `groupIds`
 * replaces one-group-at-a-time; the single-group route still exists for
 * clients that predate it.
 */
export const ShareToGroupBodySchema = z.object({
  sourceType: ShareSourceTypeSchema,
  sourceId: z.string().uuid(),
});
export const ShareToGroupsBodySchema = z.object({
  sourceType: ShareSourceTypeSchema,
  sourceId: z.string().uuid(),
  groupIds: z.array(z.string().uuid()).min(1).max(50),
});
export type ShareToGroupsBody = z.infer<typeof ShareToGroupsBodySchema>;

export const ShareResultSchema = z.object({
  groupId: z.string().uuid(),
  id: z.string().uuid().optional(),
  /** Present when that one group failed; the rest still went through. */
  error: z.string().optional(),
});
export type ShareResult = z.infer<typeof ShareResultSchema>;
export type ShareToGroupBody = z.infer<typeof ShareToGroupBodySchema>;

/** Edit a single node inside an editable ("editor") group share. */
export const EditSharedNodeBodySchema = z.object({
  title: z.string().min(1).max(1024).optional(),
  url: z.string().url().max(8192).optional(),
  name: z.string().min(1).max(256).optional(),
  description: z.string().max(1_000_000).nullable().optional(),
  baseRev: z.number().int().optional(),
});
export type EditSharedNodeBody = z.infer<typeof EditSharedNodeBodySchema>;

export const SharedItemSchema = z.object({
  id: z.string().uuid(),
  groupId: z.string().uuid(),
  groupName: z.string(),
  sharedById: z.string().uuid(),
  sharedByEmail: z.string(),
  sourceType: ShareSourceTypeSchema,
  sourceId: z.string().uuid(),
  payloadStatus: z.enum(["pending", "ready", "error"]),
  access: AccessLevelSchema.default("viewer"),
  rev: z.number().int().default(1),
  // Decrypted display label (the shared folder/bookmark name), when ready.
  label: z.string().nullable().default(null),
  createdAt: z.string(),
  updatedAt: z.string(),
});
export type SharedItem = z.infer<typeof SharedItemSchema>;

export const InvitationStatusSchema = z.enum([
  "pending",
  "accepted",
  "rejected",
  "expired",
]);
export type InvitationStatus = z.infer<typeof InvitationStatusSchema>;

/** An invitation as seen by the sender (owner/admin), with its status. */
export const SentInvitationSchema = z.object({
  id: z.string().uuid(),
  groupId: z.string().uuid(),
  email: z.string(),
  // The invite token, so the sender can re-copy the /invite/<token> link.
  token: z.string(),
  invitedByEmail: z.string(),
  expiresAt: z.string().nullable(),
  acceptedAt: z.string().nullable(),
  rejectedAt: z.string().nullable(),
  createdAt: z.string(),
  status: InvitationStatusSchema,
});
export type SentInvitation = z.infer<typeof SentInvitationSchema>;

/* ------------------------------------------------------------------ */
/* Structural edits inside an editor share                             */
/* ------------------------------------------------------------------ */

/**
 * What a member with editor access can do to the *shape* of a shared folder,
 * as opposed to the text of a node that was already there.
 *
 * The id of a new node is chosen by the server when the operation is accepted
 * and used both in the share payload and later in the owner's real row, so the
 * two never have to be matched up by name afterwards.
 */
export const CreateSharedFolderBodySchema = z.object({
  /** Node id inside the share; null = the share's own root. */
  parentId: z.string().uuid().nullable().optional(),
  name: z.string().trim().min(1).max(256),
  baseRev: z.number().int().optional(),
});
export type CreateSharedFolderBody = z.infer<typeof CreateSharedFolderBodySchema>;

export const CreateSharedBookmarkBodySchema = z.object({
  folderId: z.string().uuid().nullable().optional(),
  url: z.string().url().max(8192),
  title: z.string().trim().min(1).max(1024).optional(),
  baseRev: z.number().int().optional(),
});
export type CreateSharedBookmarkBody = z.infer<
  typeof CreateSharedBookmarkBodySchema
>;

export const DeleteSharedNodeBodySchema = z.object({
  baseRev: z.number().int().optional(),
});
export type DeleteSharedNodeBody = z.infer<typeof DeleteSharedNodeBodySchema>;

export const MoveSharedNodeBodySchema = z.object({
  /** Target folder inside the share; null = the share's own root. */
  folderId: z.string().uuid().nullable(),
  /** Index inside that folder. Omitted means "at the end". */
  position: z.number().int().min(0).optional(),
  baseRev: z.number().int().optional(),
});
export type MoveSharedNodeBody = z.infer<typeof MoveSharedNodeBodySchema>;

export const SetSharedTagsBodySchema = z.object({
  /** By name: the owner's tag ids mean nothing in a member's account. */
  tags: z.array(z.string().trim().min(1).max(64)).max(50),
  baseRev: z.number().int().optional(),
});
export type SetSharedTagsBody = z.infer<typeof SetSharedTagsBodySchema>;

export const SetSharedAppearanceBodySchema = z.object({
  bgColor: z.string().max(400).nullable().optional(),
  textTone: z.enum(["auto", "light", "dark"]).nullable().optional(),
  baseRev: z.number().int().optional(),
});
export type SetSharedAppearanceBody = z.infer<
  typeof SetSharedAppearanceBodySchema
>;

export const SetSharedFavoriteBodySchema = z.object({
  favorite: z.boolean(),
  baseRev: z.number().int().optional(),
});
export type SetSharedFavoriteBody = z.infer<typeof SetSharedFavoriteBodySchema>;
