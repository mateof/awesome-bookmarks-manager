import { z } from "zod";

/**
 * Files attached to a folder or a bookmark.
 *
 * Deliberately separate from the description's inline images. Those live
 * inside the note's own encrypted field and are capped by it (a screenshot or
 * two); an attachment is a real file on disk with its own blob, its own quota
 * accounting and a download URL.
 *
 * The name and the MIME type are encrypted like any other user content: the
 * server never learns that you attached "nomina-marzo.pdf". Only the byte
 * count is visible, and that is unavoidable — it is the size of the file on
 * disk.
 */
export const AttachmentEntitySchema = z.enum(["folder", "bookmark"]);
export type AttachmentEntity = z.infer<typeof AttachmentEntitySchema>;

export const AttachmentSchema = z.object({
  id: z.string().uuid(),
  entityType: AttachmentEntitySchema,
  entityId: z.string().uuid(),
  /** Original file name, as uploaded. Decrypted for the owner. */
  name: z.string(),
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

/**
 * Per-file ceiling. The seal is AES-GCM over the whole buffer in memory, not
 * a stream, so this is a memory bound as much as a policy: a handful of
 * concurrent uploads at this size stay comfortable, a 2 GB video would not.
 */
export const MAX_ATTACHMENT_BYTES = 25 * 1024 * 1024;
