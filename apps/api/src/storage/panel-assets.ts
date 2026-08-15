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
  const path = await writeBlob(join(panelBlobDir(userId, panelId), "bg.bin"), sealed);
  return { path, mime };
}

/** Decrypt a stored panel background (needs only the MASTER_KEY, no DEK). */
export function openPanelBgAsset(userId: string, sealed: Buffer): Buffer {
  return aeadDecrypt(masterKey(), sealed, panelBgAad(userId));
}
