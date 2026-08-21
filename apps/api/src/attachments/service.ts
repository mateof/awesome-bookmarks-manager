import { aeadDecrypt, aeadEncrypt } from "@awesome-bookmarks/crypto";
import {
  MAX_ATTACHMENT_BYTES,
  type Attachment,
  type AttachmentEntity,
} from "@awesome-bookmarks/shared";
import type { MultipartFile } from "@fastify/multipart";
import { and, asc, eq, inArray, isNull } from "drizzle-orm";
import { randomUUID } from "node:crypto";
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
import { BadRequest, NotFound } from "../util/errors.js";
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
async function readUpload(file: MultipartFile): Promise<Buffer> {
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

export async function addAttachment(
  ctx: AuthedContext,
  entityType: AttachmentEntity,
  entityId: string,
  file: MultipartFile,
): Promise<Attachment> {
  // Ownership is checked inside storeAttachment, but do it before reading the
  // body too: no point streaming 25 MB up to reject the entity afterwards.
  assertOwnsEntity(ctx, entityType, entityId);
  const bytes = await readUpload(file);
  return storeAttachment(
    ctx,
    entityType,
    entityId,
    file.filename ?? "archivo",
    file.mimetype || "application/octet-stream",
    bytes,
  );
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
): Promise<Attachment> {
  // Checked here rather than only in the caller: this is the one door every
  // path to a new attachment goes through, so the guard belongs on it.
  assertOwnsEntity(ctx, entityType, entityId);
  const id = randomUUID();
  const name = cleanName(rawName);
  const mime = rawMime || "application/octet-stream";

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
    .orderBy(asc(attachments.createdAt))
    .all();

  return rows.map((r) => {
    const mime = openField(ctx.dek, ctx.userId, "attachment.mime", r.mimeCt);
    return {
      id: r.id,
      entityType,
      entityId,
      name: openField(ctx.dek, ctx.userId, "attachment.name", r.nameCt),
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
      getDb()
        .insert(attachments)
        .values({
          id,
          userId: ctx.userId,
          entityType,
          entityId: newId,
          nameCt: r.nameCt,
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
