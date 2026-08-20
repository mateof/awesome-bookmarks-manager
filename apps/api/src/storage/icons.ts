import { aeadEncrypt } from "@awesome-bookmarks/crypto";
import type { MultipartFile } from "@fastify/multipart";
import { join } from "node:path";
import { BadRequest } from "../util/errors.js";
import {
  bookmarkBlobDir,
  folderBlobDir,
  writeBlob,
} from "./blobs.js";

const MAX_BYTES = 2 * 1024 * 1024; // 2 MB
const MAX_BG_BYTES = 4 * 1024 * 1024; // 4 MB — background images are larger
const OK_TYPES = new Set([
  "image/png",
  "image/jpeg",
  "image/gif",
  "image/webp",
  "image/svg+xml",
  "image/x-icon",
  "image/vnd.microsoft.icon",
  "image/avif",
  "application/octet-stream", // browsers occasionally use this for .ico
]);

/**
 * The same validation and size cap the personal upload routes use, exposed so
 * a group share can accept an image without a second set of rules about what
 * counts as one.
 */
export async function readImageUpload(
  file: MultipartFile,
  background = false,
): Promise<Buffer> {
  return readMultipart(file, background ? MAX_BG_BYTES : MAX_BYTES);
}

async function readMultipart(
  file: MultipartFile,
  cap = MAX_BYTES,
): Promise<Buffer> {
  // Be lenient: accept any "image/*" mimetype, plus the explicit list above
  // (which covers ICO and the generic octet-stream that some servers serve
  // favicons as). The bytes are sniffed on read for the GET endpoint anyway.
  if (!OK_TYPES.has(file.mimetype) && !file.mimetype.startsWith("image/")) {
    throw BadRequest(`Tipo de imagen no soportado: ${file.mimetype}`);
  }
  const chunks: Buffer[] = [];
  let size = 0;
  for await (const chunk of file.file) {
    const buf = Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk as Uint8Array);
    chunks.push(buf);
    size += buf.length;
    if (size > cap) {
      throw BadRequest(
        `La imagen supera ${Math.round(cap / 1024 / 1024)}MB`,
      );
    }
  }
  return Buffer.concat(chunks);
}

export async function storeBookmarkIcon(
  userId: string,
  dek: Buffer,
  bookmarkId: string,
  file: MultipartFile,
): Promise<string> {
  const bytes = await readMultipart(file);
  const sealed = aeadEncrypt(dek, bytes, `${userId}|bookmark.icon`);
  return writeBlob(
    userId,
    join(bookmarkBlobDir(userId, bookmarkId), "user-icon.bin"),
    sealed,
  );
}

export async function storeFolderIcon(
  userId: string,
  dek: Buffer,
  folderId: string,
  file: MultipartFile,
): Promise<string> {
  const bytes = await readMultipart(file);
  const sealed = aeadEncrypt(dek, bytes, `${userId}|folder.icon`);
  return writeBlob(
    userId,
    join(folderBlobDir(userId, folderId), "user-icon.bin"),
    sealed,
  );
}

export async function storeBookmarkBgImage(
  userId: string,
  dek: Buffer,
  bookmarkId: string,
  file: MultipartFile,
): Promise<string> {
  const bytes = await readMultipart(file, MAX_BG_BYTES);
  const sealed = aeadEncrypt(dek, bytes, `${userId}|bookmark.bg`);
  return writeBlob(
    userId,
    join(bookmarkBlobDir(userId, bookmarkId), "user-bg.bin"),
    sealed,
  );
}

export async function storeFolderBgImage(
  userId: string,
  dek: Buffer,
  folderId: string,
  file: MultipartFile,
): Promise<string> {
  const bytes = await readMultipart(file, MAX_BG_BYTES);
  const sealed = aeadEncrypt(dek, bytes, `${userId}|folder.bg`);
  return writeBlob(
    userId,
    join(folderBlobDir(userId, folderId), "user-bg.bin"),
    sealed,
  );
}
