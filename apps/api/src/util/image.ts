import { createHash } from "node:crypto";
import type { FastifyReply, FastifyRequest } from "fastify";

/**
 * Icon/background images are served from a URL that is stable per entity
 * (`/folders/:id/bg-image`), and the blob is overwritten in place when the
 * user picks a new one, so the URL never changes. With a long `max-age` the
 * browser kept showing the old image after a change. We instead revalidate:
 * a weak ETag derived from the row's `updatedAt` (which bumps whenever the
 * icon/background is set or cleared) lets the browser get a cheap 304 when
 * nothing changed and the fresh bytes the moment it does.
 */
export function imageEtag(updatedAt: string): string {
  return `"${createHash("sha1").update(updatedAt).digest("hex").slice(0, 16)}"`;
}

/**
 * Set revalidation headers for an image response. Returns true after sending a
 * 304 when the client's cached copy still matches (caller should stop);
 * otherwise the caller decrypts and sends the bytes.
 */
export function imageNotModified(
  req: FastifyRequest,
  reply: FastifyReply,
  updatedAt: string,
): boolean {
  const etag = imageEtag(updatedAt);
  reply.header("etag", etag);
  reply.header("cache-control", "private, no-cache");
  if (req.headers["if-none-match"] === etag) {
    reply.code(304).send();
    return true;
  }
  return false;
}

/**
 * Best-effort image content-type from magic bytes. Blobs are stored without a
 * recorded MIME, and browsers will not render an SVG served as a generic
 * `image/*`, so serving the right type here is what makes SVG icons and
 * backgrounds actually display in <img>/CSS.
 */
export function detectImageContentType(buf: Buffer): string {
  if (
    buf.length >= 8 &&
    buf
      .subarray(0, 8)
      .equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]))
  )
    return "image/png";
  if (buf.length >= 3 && buf[0] === 0xff && buf[1] === 0xd8 && buf[2] === 0xff)
    return "image/jpeg";
  if (buf.length >= 4 && buf.subarray(0, 4).toString("ascii") === "GIF8")
    return "image/gif";
  if (
    buf.length >= 12 &&
    buf.subarray(0, 4).toString("ascii") === "RIFF" &&
    buf.subarray(8, 12).toString("ascii") === "WEBP"
  )
    return "image/webp";
  if (
    buf.length >= 4 &&
    buf[0] === 0x00 &&
    buf[1] === 0x00 &&
    buf[2] === 0x01 &&
    buf[3] === 0x00
  )
    return "image/x-icon";
  // SVG/XML: scan the head (tolerates a BOM, whitespace or an <?xml prolog).
  if (buf.subarray(0, 256).toString("utf8").toLowerCase().includes("<svg"))
    return "image/svg+xml";
  return "application/octet-stream";
}
