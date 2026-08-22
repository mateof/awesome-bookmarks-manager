import { z } from "zod";

export const SnapshotStatusSchema = z.enum([
  "none",
  "pending",
  "running",
  "ready",
  "error",
]);
export type SnapshotStatus = z.infer<typeof SnapshotStatusSchema>;

const BgColor = z
  .string()
  .max(40)
  .regex(/^(#[0-9a-fA-F]{3,8}|rgba?\([^)]+\))$/, "Invalid color");

export const BookmarkSchema = z.object({
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
  folderId: z.string().uuid().nullable(),
  title: z.string(),
  url: z.string().url(),
  description: z.string().nullable(),
  iconBlobPath: z.string().nullable(),
  imageBlobPath: z.string().nullable().optional(),
  bgColor: z.string().nullable().optional(),
  /**
   * Manual override for the text colour drawn over the card. "auto" (or null)
   * lets contrast decide, which is right almost always; this exists for the
   * mid-tone backgrounds where neither white nor near-black is comfortable.
   */
  textTone: z.enum(["auto", "light", "dark"]).nullable().optional(),
  snapshotStatus: SnapshotStatusSchema,
  snapshotError: z.string().nullable().optional(),
  hasSnapshot: z.boolean(),
  /** Starred by the user; surfaced in the "Favoritos" bar. */
  favorite: z.boolean().default(false),
  /** Symlink: id of the real bookmark this row mirrors (null = a real one). */
  aliasOf: z.string().nullable().default(null),
  shareOrigin: z.string().nullable().default(null),
  position: z.number().int(),
  rev: z.number().int().default(1),
  tagIds: z.array(z.string().uuid()).default([]),
  createdAt: z.string(),
  updatedAt: z.string(),
});
export type Bookmark = z.infer<typeof BookmarkSchema>;

export const CreateBookmarkBodySchema = z.object({
  folderId: z.string().uuid().nullable().optional(),
  url: z.string().url().max(8192),
  title: z.string().min(1).max(1024).optional(),
  description: z.string().max(1_000_000).optional(),
  tagIds: z.array(z.string().uuid()).optional(),
  bgColor: BgColor.nullable().optional(),
  textTone: z.enum(["auto", "light", "dark"]).nullable().optional(),
  favorite: z.boolean().optional(),
  fetchSnapshot: z.boolean().default(true),
});
export type CreateBookmarkBody = z.infer<typeof CreateBookmarkBodySchema>;

export const MoveBookmarkBodySchema = z.object({
  newFolderId: z.string().uuid().nullable(),
  position: z.number().int().min(0),
});
export type MoveBookmarkBody = z.infer<typeof MoveBookmarkBodySchema>;

export const UpdateBookmarkBodySchema = z.object({
  folderId: z.string().uuid().nullable().optional(),
  title: z.string().min(1).max(1024).optional(),
  url: z.string().url().max(8192).optional(),
  description: z.string().max(1_000_000).nullable().optional(),
  tagIds: z.array(z.string().uuid()).optional(),
  bgColor: BgColor.nullable().optional(),
  textTone: z.enum(["auto", "light", "dark"]).nullable().optional(),
  favorite: z.boolean().optional(),
  // Optimistic concurrency: the rev the client last saw (see folders).
  baseRev: z.number().int().optional(),
});
export type UpdateBookmarkBody = z.infer<typeof UpdateBookmarkBodySchema>;

export const ListBookmarksQuerySchema = z.object({
  folderId: z.string().uuid().optional(),
  tagId: z.string().uuid().optional(),
  q: z.string().max(256).optional(),
  cursor: z.string().optional(),
  /** `?favorite=1` restricts the listing to starred bookmarks. */
  favorite: z
    .union([z.boolean(), z.enum(["1", "0", "true", "false"])])
    .transform((v) => v === true || v === "1" || v === "true")
    .optional(),
  // Optional. By default the endpoint returns *everything* — this is a
  // self-hosted personal app and there's no scenario where silently
  // truncating the user's own bookmarks is helpful. Callers that genuinely
  // want a slice (search top-N, future pagination) can still pass a number.
  limit: z.coerce.number().int().min(1).max(100000).optional(),
});
export type ListBookmarksQuery = z.infer<typeof ListBookmarksQuerySchema>;
