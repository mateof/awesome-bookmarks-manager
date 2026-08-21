import { z } from "zod";

/**
 * Files attached to a folder or a bookmark.
 *
 * Deliberately separate from the description's inline images. Those live
 * inside the note's own encrypted field and are capped by it (a screenshot or
 * two); an attachment is a real file on disk with its own blob, its own quota
 * accounting and a download URL.
 *
 * The name, the description and the slug are encrypted like any other user
 * content: the server never learns that you attached "nomina-marzo.pdf". Only
 * the byte count is visible, and that is unavoidable — it is the size of the
 * file on disk.
 */
export const AttachmentEntitySchema = z.enum(["folder", "bookmark"]);
export type AttachmentEntity = z.infer<typeof AttachmentEntitySchema>;

/**
 * A slug is the durable, human name a note refers to a file by: `#contrato-2026`
 * keeps working when the file is renamed, and reads like something a person
 * wrote. Restricted to lowercase, digits and single hyphens so it can sit in a
 * reference without quoting and cannot be confused with prose.
 */
export const SLUG_RE = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;
export const SlugSchema = z
  .string()
  .min(2)
  .max(64)
  .regex(SLUG_RE, "slug inválido");

/**
 * Turn a file name into a slug candidate: strip the extension, fold accents,
 * lowercase, and collapse everything else into single hyphens.
 *
 * Shared rather than duplicated because the client suggests a slug the moment
 * you pick a file and the server has to accept exactly what it suggested. Two
 * implementations of "slugify" that disagree on, say, "ñ" would produce a
 * confusing rejection right after the field was filled in for you.
 */
export function slugify(fileName: string): string {
  const withoutExt = fileName.replace(/\.[^.]+$/, "");
  const folded = withoutExt
    .normalize("NFD")
    // Combining diacritical marks: "ñ" -> "n", "é" -> "e".
    .replace(/[\u0300-\u036f]/g, "");
  const slug = folded
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 64)
    .replace(/-+$/g, "");
  // A file called "📎.pdf" folds away to nothing; give it something valid
  // rather than failing the upload over its name.
  return slug.length >= 2 ? slug : "archivo";
}

export const AttachmentSchema = z.object({
  id: z.string().uuid(),
  entityType: AttachmentEntitySchema,
  entityId: z.string().uuid(),
  /** Display name. Starts as the uploaded file name; editable afterwards. */
  name: z.string(),
  /** Free-text note about what this file is. */
  description: z.string().nullable(),
  /** Unique per account, and how references find it. */
  slug: z.string(),
  /** Declared content type, decrypted. Never trusted for serving. */
  mime: z.string(),
  sizeBytes: z.number().int(),
  /**
   * True when the stored bytes really are a raster image, so the UI can show
   * a thumbnail. Sniffed from the magic bytes, not from `mime`, and false for
   * SVG (which can carry script).
   */
  previewable: z.boolean(),
  createdAt: z.string(),
});
export type Attachment = z.infer<typeof AttachmentSchema>;

export const UpdateAttachmentBodySchema = z.object({
  name: z.string().min(1).max(200).optional(),
  description: z.string().max(2000).nullable().optional(),
  slug: SlugSchema.optional(),
});
export type UpdateAttachmentBody = z.infer<typeof UpdateAttachmentBodySchema>;

/**
 * Per-file ceiling. The seal is AES-GCM over the whole buffer in memory, not
 * a stream, so this is a memory bound as much as a policy: a handful of
 * concurrent uploads at this size stay comfortable, a 2 GB video would not.
 */
export const MAX_ATTACHMENT_BYTES = 25 * 1024 * 1024;
