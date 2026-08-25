import { z } from "zod";

/**
 * References inside a description: a chip that points at another folder, at
 * another bookmark, or at an attached file.
 *
 * They are stored as ordinary anchors carrying data attributes, the same trick
 * the copyable/spoiler marks use. That matters because the HTML goes through a
 * server-side sanitiser and is rendered in several places (the app, public
 * panels, shared views); a custom element would be stripped, a data attribute
 * on an anchor survives.
 *
 * Entities are referenced **by id** and files **by slug**, on purpose. An id is
 * stable while you rename things, which is what you want for a bookmark. A
 * file's slug is the name a person wrote in their note, and keeping it as the
 * key means replacing the file under the same slug keeps every reference to it
 * working.
 */

export const REF_TYPE_ATTR = "data-ref";
export const REF_ID_ATTR = "data-ref-id";
export const REF_SLUG_ATTR = "data-ref-slug";

export const RefTypeSchema = z.enum([
  "folder",
  "bookmark",
  "asset",
  /**
   * One row of one of your tables.
   *
   * Addressed by `databaseId:rowId` in the single id attribute a chip has.
   * Two ids in one string is not elegant, but the alternative is a second
   * attribute that every sanitiser, renderer and copy path in the app would
   * have to learn about, for one kind of reference.
   */
  "row",
]);
export type RefType = z.infer<typeof RefTypeSchema>;

/** What a reference chip needs in order to render itself and its tooltip. */
export const ResolvedRefSchema = z.object({
  type: RefTypeSchema,
  /** Entity id, or the attachment id once a slug has been resolved. */
  id: z.string().nullable(),
  /** Present for assets; the key the note actually wrote down. */
  slug: z.string().nullable(),
  title: z.string(),
  /** Bookmarks only. */
  url: z.string().nullable(),
  /**
   * Plain text, already stripped of markup and truncated. The tooltip shows a
   * preview, and shipping the whole rich-text body of every referenced note
   * just to cut it down in the browser would be wasteful.
   */
  description: z.string().nullable(),
  /** False when the target no longer exists, so the chip can say so. */
  found: z.boolean(),
});
export type ResolvedRef = z.infer<typeof ResolvedRefSchema>;

export const ResolveRefsBodySchema = z.object({
  refs: z
    .array(
      z.object({
        type: RefTypeSchema,
        id: z.string().optional(),
        slug: z.string().optional(),
      }),
    )
    .max(200),
});
export type ResolveRefsBody = z.infer<typeof ResolveRefsBodySchema>;

/** A candidate in the "@" picker. */
export const RefCandidateSchema = z.object({
  type: RefTypeSchema,
  id: z.string(),
  slug: z.string().nullable(),
  title: z.string(),
  url: z.string().nullable(),
  /** Breadcrumb-ish hint so two bookmarks with the same title are tellable. */
  hint: z.string().nullable(),
});
export type RefCandidate = z.infer<typeof RefCandidateSchema>;
