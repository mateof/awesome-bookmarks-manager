import { z } from "zod";

const HEX_COLOR = /^#[0-9a-fA-F]{6}$/;

export const TagSchema = z.object({
  id: z.string().uuid(),
  name: z.string(),
  color: z.string().regex(HEX_COLOR),
});
export type Tag = z.infer<typeof TagSchema>;

export const CreateTagBodySchema = z.object({
  name: z.string().min(1).max(64),
  color: z.string().regex(HEX_COLOR).default("#64748b"),
});
export type CreateTagBody = z.infer<typeof CreateTagBodySchema>;

export const UpdateTagBodySchema = z.object({
  name: z.string().min(1).max(64).optional(),
  color: z.string().regex(HEX_COLOR).optional(),
});
export type UpdateTagBody = z.infer<typeof UpdateTagBodySchema>;

/**
 * Add tags to a batch of folders and bookmarks at once.
 *
 * Adds rather than sets. A multi-selection holds items with different tags
 * already, so "these are now the tags" would silently strip whatever each one
 * had; the only operation that means the same thing for every item in a mixed
 * selection is "also put these on".
 */
export const ApplyTagsBodySchema = z.object({
  folderIds: z.array(z.string().uuid()).max(1000).default([]),
  bookmarkIds: z.array(z.string().uuid()).max(1000).default([]),
  tagIds: z.array(z.string().uuid()).min(1).max(64),
});
export type ApplyTagsBody = z.infer<typeof ApplyTagsBodySchema>;

export const ApplyTagsResultSchema = z.object({
  folders: z.number().int(),
  bookmarks: z.number().int(),
  /** Items the caller may see but not write, named so the UI can say so. */
  skipped: z.number().int(),
});
export type ApplyTagsResult = z.infer<typeof ApplyTagsResultSchema>;
