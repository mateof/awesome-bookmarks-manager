import { z } from "zod";

/**
 * Deleting is soft everywhere in the app: rows keep their data and only get a
 * `deletedAt` stamp. The trash exposes that stamp so a delete stops being a
 * one-way door.
 *
 * `groupKey` is the deletion timestamp shared by everything removed in the
 * same action (deleting a folder stamps its whole subtree at once). Restoring
 * any member restores exactly that group, which is what makes "undo a cascade
 * delete" a single click instead of dozens.
 */
export const TrashItemSchema = z.object({
  type: z.enum(["folder", "bookmark"]),
  id: z.string().uuid(),
  title: z.string(),
  /** For bookmarks: the URL. Null for folders. */
  url: z.string().nullable(),
  /** Folder the item lived in (a folder's parent). Null at the root. */
  parentId: z.string().uuid().nullable(),
  /** Human path the item will return to, e.g. "Trabajo / Referencias". */
  path: z.string(),
  deletedAt: z.string(),
  groupKey: z.string(),
  /** How many other rows share this groupKey (0 when deleted on its own). */
  siblings: z.number().int(),
});
export type TrashItem = z.infer<typeof TrashItemSchema>;

export const RestoreTrashBodySchema = z.object({
  type: z.enum(["folder", "bookmark"]),
  id: z.string().uuid(),
});
export type RestoreTrashBody = z.infer<typeof RestoreTrashBodySchema>;

export const PurgeTrashQuerySchema = z.object({
  /** Only purge rows deleted more than N days ago. Omit to purge everything. */
  olderThanDays: z.coerce.number().int().min(0).max(3650).optional(),
});
export type PurgeTrashQuery = z.infer<typeof PurgeTrashQuerySchema>;
