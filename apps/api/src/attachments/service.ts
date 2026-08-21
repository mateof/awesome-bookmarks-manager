import { aeadDecrypt, aeadEncrypt } from "@awesome-bookmarks/crypto";
import {
  MAX_ATTACHMENT_BYTES,
  SLUG_RE,
  slugify,
  type Attachment,
  type AttachmentEntity,
  type UpdateAttachmentBody,
} from "@awesome-bookmarks/shared";
import type { MultipartFile } from "@fastify/multipart";
import { and, asc, eq, inArray, isNull } from "drizzle-orm";
import { createHash, randomUUID } from "node:crypto";
import { join } from "node:path";
import type { AuthedContext } from "../auth/session.js";
import { openField, sealField } from "../auth/encryption.js";
import { getDb } from "../db/client.js";
import { attachments, bookmarks, folders } from "../db/schema.js";
import {
  bookmarkBlobDir,
  copyBlob,
  deleteBlob,
  folderBlobDir,
  readBlob,
  writeBlob,
} from "../storage/blobs.js";
import { BadRequest, Conflict, NotFound } from "../util/errors.js";
import { detectImageContentType } from "../util/image.js";

/**
 * Attachments: real files hanging off a folder or a bookmark.
 *
 * The bytes go through exactly the same pipeline as an uploaded icon — sealed
 * with the user's DEK, written with `writeBlob` so the quota is checked and
 * the usage total stays accurate — which is why this is a small module rather
 * than a subsystem. What is new is only the row that remembers the file's
 * name, and that name is encrypted too.
 *
 * Two limits are deliberate:
 *
 * - `MAX_ATTACHMENT_BYTES` per file, because AES-GCM here seals a whole
 *   buffer in memory rather than streaming. It is a memory bound first and a
 *   policy second.
 * - Nothing is listed with the parent entity. The folder grid and the
 *   bookmark list never join this table; the detail view asks for the files
 *   separately. Browsing stays exactly as fast as it was.
 */

/** Blobs that are safe to hand back with their real type and rendered inline. */
const PREVIEWABLE = new Set([
  "image/png",
  "image/jpeg",
  "image/gif",
  "image/webp",
]);

function entityDir(
  userId: string,
  entityType: AttachmentEntity,
  entityId: string,
): string {
  const base =
    entityType === "folder"
      ? folderBlobDir(userId, entityId)
      : bookmarkBlobDir(userId, entityId);
  return join(base, "attachments");
}

/**
 * Throws unless the entity exists, is this user's and is not in the trash.
 * Attachments are addressed by their own id afterwards, so this is the only
 * place the parent is checked and it has to be checked here.
 */
export function assertOwnsEntity(
  ctx: AuthedContext,
  entityType: AttachmentEntity,
  entityId: string,
): void {
  const table = entityType === "folder" ? folders : bookmarks;
  const row = getDb()
    .select({ id: table.id })
    .from(table)
    .where(
      and(
        eq(table.id, entityId),
        eq(table.userId, ctx.userId),
        isNull(table.deletedAt),
      ),
    )
    .get();
  if (!row) throw NotFound("Not found");
}

/** Plaintext bytes of an upload, with the per-file cap enforced as it streams. */
export async function readUpload(file: MultipartFile): Promise<Buffer> {
  const chunks: Buffer[] = [];
  let size = 0;
  for await (const chunk of file.file) {
    const buf = Buffer.isBuffer(chunk)
      ? chunk
      : Buffer.from(chunk as Uint8Array);
    chunks.push(buf);
    size += buf.length;
    if (size > MAX_ATTACHMENT_BYTES) {
      throw BadRequest(
        `El fichero supera ${Math.round(MAX_ATTACHMENT_BYTES / 1024 / 1024)}MB`,
      );
    }
  }
  if (size === 0) throw BadRequest("El fichero está vacío");
  return Buffer.concat(chunks);
}

/**
 * Strip anything that could make the stored name behave like a path. The name
 * never touches the filesystem (the blob is named after the row id), but it
 * does go into a Content-Disposition header on the way out.
 */
function cleanName(raw: string): string {
  const base = raw.split(/[\\/]/).pop() ?? "";
  // eslint-disable-next-line no-control-regex
  const safe = base.replace(/[\u0000-\u001f\u007f"]/g, "").trim();
  return (safe || "archivo").slice(0, 200);
}

/**
 * Per-user deterministic hash of a slug.
 *
 * The uniqueness constraint has to live in the database, and a UNIQUE index
 * over AES-GCM ciphertext would never fire because every write gets a fresh
 * IV. Hashing gives the index something stable to compare while keeping the
 * slug itself unreadable at rest. Salted with the user id, exactly like
 * `urlHash`, so the same slug in two accounts does not produce the same row.
 */
function slugHashOf(userId: string, slug: string): string {
  return createHash("sha256").update(userId).update("|slug|").update(slug).digest("hex");
}

function slugTaken(userId: string, slug: string, exceptId?: string): boolean {
  const row = getDb()
    .select({ id: attachments.id })
    .from(attachments)
    .where(
      and(
        eq(attachments.userId, userId),
        eq(attachments.slugHash, slugHashOf(userId, slug)),
      ),
    )
    .get();
  return !!row && row.id !== exceptId;
}

/**
 * A free slug near the one asked for: `contrato`, then `contrato-2`, `-3`…
 *
 * Used only where the app is *suggesting* (an upload with no slug of its own).
 * When the user types a slug explicitly and it collides they get a 409 and get
 * to choose, because silently saving their note's key under a different name
 * than they wrote would break the reference they were about to type.
 */
function freeSlug(userId: string, base: string): string {
  const clean = SLUG_RE.test(base) ? base : slugify(base);
  if (!slugTaken(userId, clean)) return clean;
  for (let n = 2; n < 1000; n++) {
    const candidate = `${clean.slice(0, 60)}-${n}`;
    if (!slugTaken(userId, candidate)) return candidate;
  }
  // 999 files sharing a base name is not a real scenario, but returning
  // something unique beats throwing on an upload that is otherwise fine.
  return `${clean.slice(0, 50)}-${randomUUID().slice(0, 8)}`;
}

/**
 * Attach bytes already in hand. Split out from the upload route so an archive
 * import can recreate a file without inventing a fake multipart part, and so
 * both paths share one sealing/quota/naming rule.
 */
export async function storeAttachment(
  ctx: AuthedContext,
  entityType: AttachmentEntity,
  entityId: string,
  rawName: string,
  rawMime: string,
  bytes: Buffer,
  meta: {
    description?: string;
    /** Refused with a 409 if taken: the user typed this and must be told. */
    slug?: string;
    /** Nudged aside if taken: the app is guessing, not obeying. */
    suggestSlug?: string;
    fileName?: string;
  } = {},
): Promise<Attachment> {
  // Checked here rather than only in the caller: this is the one door every
  // path to a new attachment goes through, so the guard belongs on it.
  assertOwnsEntity(ctx, entityType, entityId);
  const id = randomUUID();
  const name = cleanName(rawName);
  const mime = rawMime || "application/octet-stream";
  const description = meta.description?.trim() || null;

  // An explicit slug is honoured or refused; a suggested one is nudged aside
  // until it is free. See freeSlug.
  let slug: string;
  if (meta.slug) {
    if (!SLUG_RE.test(meta.slug)) throw BadRequest("Slug inválido");
    if (slugTaken(ctx.userId, meta.slug)) {
      throw Conflict(`El slug "${meta.slug}" ya está en uso`);
    }
    slug = meta.slug;
  } else {
    slug = freeSlug(ctx.userId, meta.suggestSlug || slugify(meta.fileName || name));
  }

  const sealed = aeadEncrypt(
    ctx.dek,
    bytes,
    `${ctx.userId}|attachment.${entityType}`,
  );
  // writeBlob does the quota check, so an upload that would blow the limit is
  // rejected before the row exists.
  const blobPath = await writeBlob(
    ctx.userId,
    join(entityDir(ctx.userId, entityType, entityId), `${id}.bin`),
    sealed,
  );

  const row = {
    id,
    userId: ctx.userId,
    entityType,
    entityId,
    nameCt: sealField(ctx.dek, ctx.userId, "attachment.name", name),
    descriptionCt: description
      ? sealField(ctx.dek, ctx.userId, "attachment.description", description)
      : null,
    slugCt: sealField(ctx.dek, ctx.userId, "attachment.slug", slug),
    slugHash: slugHashOf(ctx.userId, slug),
    mimeCt: sealField(ctx.dek, ctx.userId, "attachment.mime", mime),
    sizeBytes: bytes.length,
    blobPath,
  };
  getDb().insert(attachments).values(row).run();

  const created = getDb()
    .select({ createdAt: attachments.createdAt })
    .from(attachments)
    .where(eq(attachments.id, id))
    .get();

  return {
    id,
    entityType,
    entityId,
    name,
    description,
    slug,
    mime,
    sizeBytes: bytes.length,
    // The *declared* type, exactly as the listing computes it. Sniffing the
    // bytes here (which are in hand) would disagree with the list a refresh
    // later, and a thumbnail that comes and goes is worse than either answer.
    previewable: PREVIEWABLE.has(mime),
    createdAt: created?.createdAt ?? new Date().toISOString(),
  };
}

export function listAttachments(
  ctx: AuthedContext,
  entityType: AttachmentEntity,
  entityId: string,
): Attachment[] {
  assertOwnsEntity(ctx, entityType, entityId);
  const rows = getDb()
    .select()
    .from(attachments)
    .where(
      and(
        eq(attachments.userId, ctx.userId),
        eq(attachments.entityType, entityType),
        eq(attachments.entityId, entityId),
      ),
    )
    .orderBy(asc(attachments.createdAt), asc(attachments.id))
    .all();

  return rows.map((r) => {
    const mime = openField(ctx.dek, ctx.userId, "attachment.mime", r.mimeCt);
    return {
      id: r.id,
      entityType,
      entityId,
      name: openField(ctx.dek, ctx.userId, "attachment.name", r.nameCt),
      description: r.descriptionCt
        ? openField(ctx.dek, ctx.userId, "attachment.description", r.descriptionCt)
        : null,
      // Rows written before slugs existed have none. Reporting an empty slug
      // is honest; the UI offers to give them one rather than inventing it
      // behind the user's back.
      slug: r.slugCt
        ? openField(ctx.dek, ctx.userId, "attachment.slug", r.slugCt)
        : "",
      mime,
      sizeBytes: r.sizeBytes,
      // The declared type is enough to decide whether to *offer* a thumbnail;
      // the download route re-sniffs the bytes before serving one inline, so a
      // lie here costs a broken <img>, not an inline script.
      previewable: PREVIEWABLE.has(mime),
      createdAt: r.createdAt,
    };
  });
}

export interface AttachmentBytes {
  name: string;
  mime: string;
  bytes: Buffer;
  /** Sniffed image type, or null when the bytes are not a safe raster image. */
  imageType: string | null;
}

export async function readAttachment(
  ctx: AuthedContext,
  id: string,
): Promise<AttachmentBytes> {
  const row = getDb()
    .select()
    .from(attachments)
    .where(and(eq(attachments.id, id), eq(attachments.userId, ctx.userId)))
    .get();
  if (!row) throw NotFound("Attachment not found");

  const sealed = await readBlob(row.blobPath);
  const bytes = aeadDecrypt(
    ctx.dek,
    sealed,
    `${ctx.userId}|attachment.${row.entityType}`,
  );
  const sniffed = detectImageContentType(bytes);
  return {
    name: openField(ctx.dek, ctx.userId, "attachment.name", row.nameCt),
    mime: openField(ctx.dek, ctx.userId, "attachment.mime", row.mimeCt),
    bytes,
    imageType: PREVIEWABLE.has(sniffed) ? sniffed : null,
  };
}

export async function deleteAttachment(
  ctx: AuthedContext,
  id: string,
): Promise<void> {
  const row = getDb()
    .select({ blobPath: attachments.blobPath })
    .from(attachments)
    .where(and(eq(attachments.id, id), eq(attachments.userId, ctx.userId)))
    .get();
  if (!row) throw NotFound("Attachment not found");
  getDb().delete(attachments).where(eq(attachments.id, id)).run();
  await deleteBlob(row.blobPath, ctx.userId);
}

/**
 * Drop every attachment belonging to entities being purged for good, blobs
 * included. Called from the trash: without it the rows would outlive their
 * folder and the bytes would sit on disk counting against the quota forever.
 */
export async function purgeAttachmentsFor(
  userId: string,
  entityType: AttachmentEntity,
  entityIds: string[],
): Promise<void> {
  if (entityIds.length === 0) return;
  const rows = getDb()
    .select({ id: attachments.id, blobPath: attachments.blobPath })
    .from(attachments)
    .where(
      and(
        eq(attachments.userId, userId),
        eq(attachments.entityType, entityType),
        inArray(attachments.entityId, entityIds),
      ),
    )
    .all();
  if (rows.length === 0) return;

  getDb()
    .delete(attachments)
    .where(
      inArray(
        attachments.id,
        rows.map((r) => r.id),
      ),
    )
    .run();
  for (const r of rows) {
    try {
      await deleteBlob(r.blobPath, userId);
    } catch (err) {
      console.warn(
        `[attachments] could not remove blob ${r.blobPath}`,
        err instanceof Error ? err.message : err,
      );
    }
  }
}

/**
 * Duplicate an entity's attachments onto a copy of it.
 *
 * Nothing is decrypted on the way. The blob's AAD is scoped to the *user*, not
 * to the entity (`<userId>|attachment.<kind>`), and so are the name and MIME
 * fields, so the sealed bytes stay valid under a new id. Copying a folder with
 * twenty attachments therefore costs twenty file copies and no crypto at all —
 * the same trick the icon copy already uses.
 */
export async function copyAttachments(
  ctx: AuthedContext,
  entityType: AttachmentEntity,
  srcId: string,
  newId: string,
): Promise<void> {
  const rows = getDb()
    .select()
    .from(attachments)
    .where(
      and(
        eq(attachments.userId, ctx.userId),
        eq(attachments.entityType, entityType),
        eq(attachments.entityId, srcId),
      ),
    )
    .all();

  for (const r of rows) {
    const id = randomUUID();
    try {
      const blobPath = await copyBlob(
        ctx.userId,
        r.blobPath,
        join(entityDir(ctx.userId, entityType, newId), `${id}.bin`),
      );
      // The one field that cannot be copied as ciphertext: the slug is unique
      // per account, so the copy gets the next free variant (`acta` -> `acta-2`)
      // and has to be re-sealed. It is a few bytes; the blob is still untouched.
      const oldSlug = r.slugCt
        ? openField(ctx.dek, ctx.userId, "attachment.slug", r.slugCt)
        : "archivo";
      const slug = freeSlug(ctx.userId, oldSlug);
      getDb()
        .insert(attachments)
        .values({
          id,
          userId: ctx.userId,
          entityType,
          entityId: newId,
          nameCt: r.nameCt,
          descriptionCt: r.descriptionCt,
          slugCt: sealField(ctx.dek, ctx.userId, "attachment.slug", slug),
          slugHash: slugHashOf(ctx.userId, slug),
          mimeCt: r.mimeCt,
          sizeBytes: r.sizeBytes,
          blobPath,
        })
        .run();
    } catch (err) {
      // Usually the quota: a duplicate that doubles the bytes can hit it.
      // Skipping one file beats aborting the whole copy half-done.
      console.warn(
        `[attachments] could not copy ${r.id}`,
        err instanceof Error ? err.message : err,
      );
    }
  }
}

/**
 * Every attachment this user has, for the reference picker.
 *
 * Slugs are stored hashed, so the server cannot do a prefix search over them.
 * Rather than give that up and store slugs in the clear, the picker fetches
 * the list once and filters in the browser. For the number of files a person
 * attaches to their bookmarks that is instant, and the slug stays unreadable
 * at rest, which was the point.
 */
export function listAllAttachments(ctx: AuthedContext): Attachment[] {
  const rows = getDb()
    .select()
    .from(attachments)
    .where(eq(attachments.userId, ctx.userId))
    .orderBy(asc(attachments.createdAt), asc(attachments.id))
    .all();

  return rows.map((r) => {
    const mime = openField(ctx.dek, ctx.userId, "attachment.mime", r.mimeCt);
    return {
      id: r.id,
      entityType: r.entityType as AttachmentEntity,
      entityId: r.entityId,
      name: openField(ctx.dek, ctx.userId, "attachment.name", r.nameCt),
      description: r.descriptionCt
        ? openField(ctx.dek, ctx.userId, "attachment.description", r.descriptionCt)
        : null,
      slug: r.slugCt
        ? openField(ctx.dek, ctx.userId, "attachment.slug", r.slugCt)
        : "",
      mime,
      sizeBytes: r.sizeBytes,
      previewable: PREVIEWABLE.has(mime),
      createdAt: r.createdAt,
    };
  });
}

/** Look one up by the key a note wrote down. Null when nothing matches. */
export function attachmentBySlug(
  ctx: AuthedContext,
  slug: string,
): Attachment | null {
  const r = getDb()
    .select()
    .from(attachments)
    .where(
      and(
        eq(attachments.userId, ctx.userId),
        eq(attachments.slugHash, slugHashOf(ctx.userId, slug)),
      ),
    )
    .get();
  if (!r) return null;
  const mime = openField(ctx.dek, ctx.userId, "attachment.mime", r.mimeCt);
  return {
    id: r.id,
    entityType: r.entityType as AttachmentEntity,
    entityId: r.entityId,
    name: openField(ctx.dek, ctx.userId, "attachment.name", r.nameCt),
    description: r.descriptionCt
      ? openField(ctx.dek, ctx.userId, "attachment.description", r.descriptionCt)
      : null,
    slug,
    mime,
    sizeBytes: r.sizeBytes,
    previewable: PREVIEWABLE.has(mime),
    createdAt: r.createdAt,
  };
}

/**
 * Rename, re-describe or re-slug a file.
 *
 * A colliding slug is a 409, never a silent rename: the slug is the key the
 * user's own notes refer to, so quietly storing a different one would break
 * the reference they are about to type and give them no way to know.
 */
export function updateAttachment(
  ctx: AuthedContext,
  id: string,
  body: UpdateAttachmentBody,
): Attachment {
  const row = getDb()
    .select()
    .from(attachments)
    .where(and(eq(attachments.id, id), eq(attachments.userId, ctx.userId)))
    .get();
  if (!row) throw NotFound("Attachment not found");

  const patch: Record<string, unknown> = {};
  if (body.name !== undefined) {
    patch.nameCt = sealField(
      ctx.dek,
      ctx.userId,
      "attachment.name",
      cleanName(body.name),
    );
  }
  if (body.description !== undefined) {
    const d = body.description?.trim() || null;
    patch.descriptionCt = d
      ? sealField(ctx.dek, ctx.userId, "attachment.description", d)
      : null;
  }
  if (body.slug !== undefined) {
    if (!SLUG_RE.test(body.slug)) throw BadRequest("Slug inválido");
    if (slugTaken(ctx.userId, body.slug, id)) {
      throw Conflict(`El slug "${body.slug}" ya está en uso`);
    }
    patch.slugCt = sealField(ctx.dek, ctx.userId, "attachment.slug", body.slug);
    patch.slugHash = slugHashOf(ctx.userId, body.slug);
  }

  if (Object.keys(patch).length > 0) {
    getDb().update(attachments).set(patch).where(eq(attachments.id, id)).run();
  }

  const updated = getDb()
    .select()
    .from(attachments)
    .where(eq(attachments.id, id))
    .get()!;
  const mime = openField(ctx.dek, ctx.userId, "attachment.mime", updated.mimeCt);
  return {
    id,
    entityType: updated.entityType as AttachmentEntity,
    entityId: updated.entityId,
    name: openField(ctx.dek, ctx.userId, "attachment.name", updated.nameCt),
    description: updated.descriptionCt
      ? openField(ctx.dek, ctx.userId, "attachment.description", updated.descriptionCt)
      : null,
    slug: updated.slugCt
      ? openField(ctx.dek, ctx.userId, "attachment.slug", updated.slugCt)
      : "",
    mime,
    sizeBytes: updated.sizeBytes,
    previewable: PREVIEWABLE.has(mime),
    createdAt: updated.createdAt,
  };
}
