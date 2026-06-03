import { z } from "zod";

export const SnapshotStatusSchema = z.enum([
  "none",
  "pending",
  "running",
  "ready",
  "error",
]);
export type SnapshotStatus = z.infer<typeof SnapshotStatusSchema>;

export const BookmarkSchema = z.object({
  id: z.string().uuid(),
  folderId: z.string().uuid().nullable(),
  title: z.string(),
  url: z.string().url(),
  description: z.string().nullable(),
  iconBlobPath: z.string().nullable(),
  snapshotStatus: SnapshotStatusSchema,
  snapshotError: z.string().nullable().optional(),
  hasSnapshot: z.boolean(),
  position: z.number().int(),
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
  fetchSnapshot: z.boolean().default(true),
});
export type CreateBookmarkBody = z.infer<typeof CreateBookmarkBodySchema>;

export const UpdateBookmarkBodySchema = z.object({
  folderId: z.string().uuid().nullable().optional(),
  title: z.string().min(1).max(1024).optional(),
  url: z.string().url().max(8192).optional(),
  description: z.string().max(1_000_000).nullable().optional(),
  tagIds: z.array(z.string().uuid()).optional(),
});
export type UpdateBookmarkBody = z.infer<typeof UpdateBookmarkBodySchema>;

export const ListBookmarksQuerySchema = z.object({
  folderId: z.string().uuid().optional(),
  tagId: z.string().uuid().optional(),
  q: z.string().max(256).optional(),
  cursor: z.string().optional(),
  // Optional. By default the endpoint returns *everything* — this is a
  // self-hosted personal app and there's no scenario where silently
  // truncating the user's own bookmarks is helpful. Callers that genuinely
  // want a slice (search top-N, future pagination) can still pass a number.
  limit: z.coerce.number().int().min(1).max(100000).optional(),
});
export type ListBookmarksQuery = z.infer<typeof ListBookmarksQuerySchema>;
