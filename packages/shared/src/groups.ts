import { z } from "zod";

export const GroupRoleSchema = z.enum(["owner", "admin", "member"]);
export type GroupRole = z.infer<typeof GroupRoleSchema>;

export const ShareSourceTypeSchema = z.enum(["folder", "bookmark"]);
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

export const ShareToGroupBodySchema = z.object({
  sourceType: ShareSourceTypeSchema,
  sourceId: z.string().uuid(),
  access: AccessLevelSchema.default("viewer"),
});
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
  invitedByEmail: z.string(),
  expiresAt: z.string().nullable(),
  acceptedAt: z.string().nullable(),
  rejectedAt: z.string().nullable(),
  createdAt: z.string(),
  status: InvitationStatusSchema,
});
export type SentInvitation = z.infer<typeof SentInvitationSchema>;
