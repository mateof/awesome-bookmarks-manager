import { z } from "zod";

// CSS color values: hex (`#rrggbb`, `#rrggbbaa`) or `rgba(...)` are the
// only forms we set; we accept null to clear.
const BgColor = z
  .string()
  .max(40)
  .regex(/^(#[0-9a-fA-F]{3,8}|rgba?\([^)]+\))$/, "Invalid color");

export const FolderSchema = z.object({
  /**
   * The group that owns this row, when it is shared content rather than the
   * caller's own. Present so the client can tell "mine" from "the group's"
   * without a second request, and so an editor knows a row is theirs to change.
   */
  keyGroupId: z.string().nullable().default(null),
  /**
   * The key scope this row is sealed with, when it is shared. Distinct from
   * `keyGroupId`: a scope can be held by several groups, a group key by one.
   */
  keyScopeId: z.string().nullable().default(null),
  /** True when this row is shared at all, by either mechanism. */
  shared: z.boolean().default(false),
  /** True when this row is the caller's own rather than a group's. */
  mine: z.boolean().default(true),
  /** Whether the caller may change it. False for a viewer inside a group. */
  canWrite: z.boolean().default(true),
  id: z.string().uuid(),
  parentId: z.string().uuid().nullable(),
  name: z.string(),
  description: z.string().nullable(),
  iconBlobPath: z.string().nullable(),
  imageBlobPath: z.string().nullable(),
  bgColor: z.string().nullable().optional(),
  /**
   * Manual override for the text colour drawn over the card. "auto" (or null)
   * lets contrast decide, which is right almost always; this exists for the
   * mid-tone backgrounds where neither white nor near-black is comfortable.
   */
  textTone: z.enum(["auto", "light", "dark"]).nullable().optional(),
  shareOrigin: z.string().nullable().default(null),
  /** Starred by the user; surfaced in the "Favoritos" bar. */
  favorite: z.boolean().default(false),
  /** Symlink: id of the real folder this row mirrors (null = a real folder). */
  aliasOf: z.string().nullable().default(null),
  // When set, this folder is a live portal ("symlink") to a group share.
  linkedShareId: z.string().nullable().default(null),
  position: z.number().int(),
  rev: z.number().int().default(1),
  tagIds: z.array(z.string().uuid()).default([]),
  createdAt: z.string(),
  updatedAt: z.string(),
});
export type Folder = z.infer<typeof FolderSchema>;

export const CreateFolderBodySchema = z.object({
  parentId: z.string().uuid().nullable().optional(),
  name: z.string().min(1).max(256),
  description: z.string().max(1_000_000).optional(),
  tagIds: z.array(z.string().uuid()).optional(),
  bgColor: BgColor.nullable().optional(),
  textTone: z.enum(["auto", "light", "dark"]).nullable().optional(),
  favorite: z.boolean().optional(),
});
export type CreateFolderBody = z.infer<typeof CreateFolderBodySchema>;

export const UpdateFolderBodySchema = z.object({
  name: z.string().min(1).max(256).optional(),
  description: z.string().max(1_000_000).nullable().optional(),
  tagIds: z.array(z.string().uuid()).optional(),
  bgColor: BgColor.nullable().optional(),
  textTone: z.enum(["auto", "light", "dark"]).nullable().optional(),
  favorite: z.boolean().optional(),
  // Optimistic concurrency: the rev the client last saw. When present and it
  // no longer matches the stored row, the update is rejected with 409.
  baseRev: z.number().int().optional(),
});
export type UpdateFolderBody = z.infer<typeof UpdateFolderBodySchema>;

export const MoveFolderBodySchema = z.object({
  newParentId: z.string().uuid().nullable(),
  position: z.number().int().min(0),
});
export type MoveFolderBody = z.infer<typeof MoveFolderBodySchema>;
