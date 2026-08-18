import { aeadDecrypt, aeadEncrypt } from "@awesome-bookmarks/crypto";
import type { MultipartFile } from "@fastify/multipart";
import { join } from "node:path";
import type { PanelBgKind } from "@awesome-bookmarks/shared";
import { masterKey } from "../auth/encryption.js";
import { BadRequest } from "../util/errors.js";
import { panelBlobDir, writeBlob } from "./blobs.js";

/**
 * Custom panel backgrounds (static image, GIF or short video). Unlike
 * folder/bookmark backgrounds (sealed with the owner's DEK), a panel is shown
 * on a public page without the owner logged in, so the asset is sealed with the
 * MASTER_KEY (AAD `master|<userId>|panel.bg`) — server-readable, like the
 * panel's payload snapshot.
 */

const MAX_PANEL_BG_BYTES = 25 * 1024 * 1024; // 25 MB — allows short loops/GIFs.

const OK_TYPES = new Set([
  "image/png",
  "image/jpeg",
  "image/gif",
  "image/webp",
  "image/avif",
  "video/mp4",
  "video/webm",
  "video/ogg",
]);

function panelBgAad(userId: string): string {
  return `master|${userId}|panel.bg`;
}

function panelFaviconAad(userId: string): string {
  return `master|${userId}|panel.favicon`;
}

const MAX_FAVICON_BYTES = 1024 * 1024; // 1 MB is plenty for a tab icon.
const FAVICON_TYPES = new Set([
  "image/png",
  "image/jpeg",
  "image/gif",
  "image/webp",
  "image/avif",
  "image/svg+xml",
  "image/x-icon",
  "image/vnd.microsoft.icon",
]);

/** image/* → "image"; video/* → "video". */
export function panelBgKind(mime: string | null | undefined): PanelBgKind | null {
  if (!mime) return null;
  if (mime.startsWith("video/")) return "video";
  if (mime.startsWith("image/")) return "image";
  return null;
}

/**
 * Read + validate the uploaded asset and store it MASTER_KEY-sealed. Returns
 * the relative blob path and the normalized MIME type to persist on the row.
 */
export async function storePanelBgAsset(
  userId: string,
  panelId: string,
  file: MultipartFile,
): Promise<{ path: string; mime: string }> {
  const mime = file.mimetype;
  if (!OK_TYPES.has(mime)) {
    throw BadRequest(`Tipo de fondo no soportado: ${mime}`);
  }
  const chunks: Buffer[] = [];
  let size = 0;
  for await (const chunk of file.file) {
    const buf = Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk as Uint8Array);
    chunks.push(buf);
    size += buf.length;
    if (size > MAX_PANEL_BG_BYTES) {
      throw BadRequest(`El fondo supera ${Math.round(MAX_PANEL_BG_BYTES / 1024 / 1024)}MB`);
    }
  }
  const sealed = aeadEncrypt(masterKey(), Buffer.concat(chunks), panelBgAad(userId));
  const path = await writeBlob(
    userId,
    join(panelBlobDir(userId, panelId), "bg.bin"),
    sealed,
  );
  return { path, mime };
}

/** Decrypt a stored panel background (needs only the MASTER_KEY, no DEK). */
export function openPanelBgAsset(userId: string, sealed: Buffer): Buffer {
  return aeadDecrypt(masterKey(), sealed, panelBgAad(userId));
}

/**
 * Store a panel's tab icon image. Sealed with the MASTER_KEY like the
 * background, so the public page can serve it without the owner logged in.
 */
export async function storePanelFaviconAsset(
  userId: string,
  panelId: string,
  file: MultipartFile,
): Promise<{ path: string; mime: string }> {
  const mime = file.mimetype;
  if (!FAVICON_TYPES.has(mime)) {
    throw BadRequest(`Tipo de icono no soportado: ${mime}`);
  }
  const chunks: Buffer[] = [];
  let size = 0;
  for await (const chunk of file.file) {
    const buf = Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk as Uint8Array);
    chunks.push(buf);
    size += buf.length;
    if (size > MAX_FAVICON_BYTES) {
      throw BadRequest(`El icono supera ${Math.round(MAX_FAVICON_BYTES / 1024)}KB`);
    }
  }
  const sealed = aeadEncrypt(masterKey(), Buffer.concat(chunks), panelFaviconAad(userId));
  const path = await writeBlob(
    userId,
    join(panelBlobDir(userId, panelId), "favicon.bin"),
    sealed,
  );
  return { path, mime };
}

/** Decrypt a stored panel tab icon (MASTER_KEY only, no DEK). */
export function openPanelFaviconAsset(userId: string, sealed: Buffer): Buffer {
  return aeadDecrypt(masterKey(), sealed, panelFaviconAad(userId));
}
