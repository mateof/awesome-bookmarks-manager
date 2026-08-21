import { z } from "zod";

/**
 * The app's own portable export format: a ZIP with the extension `.abz`.
 *
 * Distinct from the cloud backup on purpose, and the difference is not the
 * container but the encryption. A cloud backup holds ciphertext sealed with
 * the owner's key, so it restores only onto that same account. This one holds
 * plaintext (optionally re-encrypted under a passphrase the user chooses), so
 * it can be imported into another folder, another account or another instance.
 *
 * Layout:
 *   manifest.json          always plaintext; says what is inside
 *   data.json              folders, bookmarks and tags
 *   blobs/<kind>/<id>/…    icons, background images, snapshots, attachments
 *
 * With a passphrase, `data.json` and `blobs/` are replaced by a single
 * `payload.bin` holding the encrypted inner archive.
 */

export const ARCHIVE_FORMAT = "awesomebookmarks-archive";
export const ARCHIVE_VERSION = 1;

export const ArchiveScopeSchema = z.enum(["account", "folder", "bookmark"]);
export type ArchiveScope = z.infer<typeof ArchiveScopeSchema>;

export const ArchiveManifestSchema = z.object({
  format: z.literal(ARCHIVE_FORMAT),
  version: z.number().int(),
  scope: ArchiveScopeSchema,
  exportedAt: z.string(),
  app: z.string(),
  /** True when the payload sits inside `payload.bin` under a passphrase. */
  encrypted: z.boolean(),
  /** scrypt parameters, present only when encrypted. */
  kdf: z
    .object({
      algorithm: z.literal("scrypt"),
      salt: z.string(),
      N: z.number().int(),
      r: z.number().int(),
      p: z.number().int(),
    })
    .optional(),
  counts: z.object({
    folders: z.number().int(),
    bookmarks: z.number().int(),
    tags: z.number().int(),
    blobs: z.number().int(),
  }),
});
export type ArchiveManifest = z.infer<typeof ArchiveManifestSchema>;

/**
 * An attached file as exported. The bytes ride in `blobs/<kind>/<id>/att-…`;
 * this is only what the importer needs to name and serve them again.
 */
export const ArchiveAttachmentSchema = z.object({
  id: z.string(),
  name: z.string(),
  mime: z.string(),
  /** Both default so archives written before these fields still import. */
  description: z.string().nullable().default(null),
  slug: z.string().default(""),
});

/** A tag as exported: matched by name on import, not by id. */
export const ArchiveTagSchema = z.object({
  name: z.string(),
  color: z.string(),
});

export const ArchiveFolderSchema = z.object({
  id: z.string(),
  parentId: z.string().nullable(),
  name: z.string(),
  description: z.string().nullable(),
  bgColor: z.string().nullable(),
  textTone: z.string().nullable(),
  favorite: z.boolean(),
  position: z.number().int(),
  tags: z.array(z.string()),
  attachments: z.array(ArchiveAttachmentSchema).default([]),
});

export const ArchiveBookmarkSchema = z.object({
  id: z.string(),
  folderId: z.string().nullable(),
  title: z.string(),
  url: z.string(),
  description: z.string().nullable(),
  bgColor: z.string().nullable(),
  textTone: z.string().nullable(),
  favorite: z.boolean(),
  position: z.number().int(),
  tags: z.array(z.string()),
  attachments: z.array(ArchiveAttachmentSchema).default([]),
});

/**
 * A database embedded in one of the exported notes, carried whole.
 *
 * Exported by value rather than by reference: an archive that kept only the id
 * would import notes pointing at tables that do not exist on the other side,
 * which is the quiet kind of data loss this format exists to avoid.
 */
export const ArchiveDatabaseSchema = z.object({
  id: z.string(),
  name: z.string(),
  columns: z.array(
    z.object({
      id: z.string(),
      kind: z.string(),
      name: z.string(),
      config: z.unknown().optional(),
      position: z.number().int(),
    }),
  ),
  rows: z.array(
    z.object({
      id: z.string(),
      cells: z.record(z.string(), z.unknown()),
      position: z.number().int(),
    }),
  ),
  views: z.array(
    z.object({
      id: z.string(),
      kind: z.string(),
      name: z.string(),
      config: z.unknown().optional(),
      position: z.number().int(),
    }),
  ),
});

export const ArchiveDataSchema = z.object({
  folders: z.array(ArchiveFolderSchema),
  bookmarks: z.array(ArchiveBookmarkSchema),
  tags: z.array(ArchiveTagSchema),
  /** Defaulted so archives written before databases existed still import. */
  databases: z.array(ArchiveDatabaseSchema).default([]),
});
export type ArchiveData = z.infer<typeof ArchiveDataSchema>;

export const ExportArchiveBodySchema = z.object({
  scope: ArchiveScopeSchema.default("account"),
  /** Required for folder/bookmark scope. */
  id: z.string().uuid().optional(),
  /** Archived page copies are the bulk of the size, so they are opt-in. */
  includeSnapshots: z.boolean().default(false),
  /** When set, the payload is encrypted under it. */
  passphrase: z.string().min(8).max(200).optional(),
});
export type ExportArchiveBody = z.infer<typeof ExportArchiveBodySchema>;

export const ImportArchiveResultSchema = z.object({
  folders: z.number().int(),
  bookmarks: z.number().int(),
  tags: z.number().int(),
  blobs: z.number().int(),
  /** Where the imported tree was rooted. */
  parentId: z.string().nullable(),
});
export type ImportArchiveResult = z.infer<typeof ImportArchiveResultSchema>;
