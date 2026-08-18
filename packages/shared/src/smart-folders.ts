import { z } from "zod";

const HEX_COLOR = /^#[0-9a-fA-F]{6}$/;

/**
 * A saved query. Everything a smart folder "contains" is derived from these
 * predicates at read time, so nothing is duplicated: rename a tag, move an
 * item, and the smart folder follows.
 *
 * The shape deliberately mirrors the `/filter` page's query string, which is
 * what makes "save this filter" a one-liner in the UI and keeps a smart folder
 * shareable as a plain URL.
 */
export const SmartQuerySchema = z.object({
  /** Tags the item must carry (see `match`). */
  tagIds: z.array(z.string().uuid()).max(50).default([]),
  /** "all" = AND across tagIds, "any" = OR. */
  match: z.enum(["all", "any"]).default("any"),
  /** Free text matched against title, URL and description. */
  text: z.string().max(200).default(""),
  /** Restrict to starred items. */
  favorite: z.boolean().default(false),
});
export type SmartQuery = z.infer<typeof SmartQuerySchema>;

export const SmartFolderSchema = z.object({
  id: z.string().uuid(),
  name: z.string(),
  query: SmartQuerySchema,
  color: z.string().regex(HEX_COLOR),
  position: z.number().int(),
  createdAt: z.string(),
  updatedAt: z.string(),
});
export type SmartFolder = z.infer<typeof SmartFolderSchema>;

export const CreateSmartFolderBodySchema = z.object({
  name: z.string().min(1).max(120),
  query: SmartQuerySchema,
  color: z.string().regex(HEX_COLOR).default("#6366f1"),
});
export type CreateSmartFolderBody = z.infer<typeof CreateSmartFolderBodySchema>;

export const UpdateSmartFolderBodySchema = z.object({
  name: z.string().min(1).max(120).optional(),
  query: SmartQuerySchema.optional(),
  color: z.string().regex(HEX_COLOR).optional(),
  position: z.number().int().min(0).optional(),
});
export type UpdateSmartFolderBody = z.infer<typeof UpdateSmartFolderBodySchema>;

/** True when the query selects nothing at all (an empty smart folder). */
export function isEmptySmartQuery(q: SmartQuery): boolean {
  return q.tagIds.length === 0 && q.text.trim() === "" && !q.favorite;
}
