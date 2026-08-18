import { z } from "zod";
import { BookmarkSchema } from "./bookmarks.js";

/**
 * Bookmarks that point at the same place. Grouping is done server-side on
 * `url_hash` (a keyed hash of the normalised URL, already stored per row), so
 * finding duplicates costs an index scan and never needs to decrypt a URL.
 */
export const DuplicateGroupSchema = z.object({
  /** Opaque grouping key (the shared url_hash). */
  key: z.string(),
  /** The shared URL, decrypted from the first member. */
  url: z.string(),
  bookmarks: z.array(BookmarkSchema),
});
export type DuplicateGroup = z.infer<typeof DuplicateGroupSchema>;

export const MergeBookmarksBodySchema = z.object({
  /** The row that survives; it absorbs the others' tags and text. */
  keepId: z.string().uuid(),
  /** Rows folded into the keeper and then moved to the trash. */
  mergeIds: z.array(z.string().uuid()).min(1).max(200),
});
export type MergeBookmarksBody = z.infer<typeof MergeBookmarksBodySchema>;

export const MergeBookmarksResultSchema = z.object({
  keptId: z.string().uuid(),
  merged: z.number().int(),
  /** Tags the keeper gained from the merged rows. */
  tagsAdded: z.number().int(),
  /** Symlinks that were repointed at the keeper. */
  aliasesRepointed: z.number().int(),
});
export type MergeBookmarksResult = z.infer<typeof MergeBookmarksResultSchema>;
