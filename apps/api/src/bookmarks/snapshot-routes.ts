import { aeadDecrypt } from "@awesome-bookmarks/crypto";
import { and, eq, isNull } from "drizzle-orm";
import type { FastifyPluginAsync } from "fastify";
import { z } from "zod";
import { requireAuth } from "../auth/session.js";
import { getDb } from "../db/client.js";
import { bookmarks } from "../db/schema.js";
import { readBlob } from "../storage/blobs.js";
import { NotFound } from "../util/errors.js";

const IdParam = z.object({ id: z.string().uuid() });

export const snapshotRoutes: FastifyPluginAsync = async (app) => {
  app.get("/bookmarks/:id/snapshot.html", async (req, reply) => {
    const ctx = requireAuth(req);
    const { id } = IdParam.parse(req.params);
    const row = getDb()
      .select({
        userId: bookmarks.userId,
        path: bookmarks.snapshotHtmlPath,
      })
      .from(bookmarks)
      .where(
        and(
          eq(bookmarks.id, id),
          eq(bookmarks.userId, ctx.userId),
          isNull(bookmarks.deletedAt),
        ),
      )
      .get();
    if (!row || !row.path) throw NotFound("Snapshot not ready");
    const sealed = await readBlob(row.path);
    const html = aeadDecrypt(
      ctx.dek,
      sealed,
      `${ctx.userId}|snapshot.html`,
    ).toString("utf8");
    reply
      .header("content-type", "text/html; charset=utf-8")
      // The snapshot is rendered inside a sandboxed iframe by the SPA — keep
      // strict CSP so a malicious page captured in the snapshot can't escape.
      .header(
        "content-security-policy",
        "default-src 'none'; img-src data: https: http:; style-src 'unsafe-inline' https: http:; font-src data: https: http:; media-src https: http:; connect-src 'none'; frame-ancestors 'self';",
      )
      .send(html);
  });

  app.get("/bookmarks/:id/snapshot.png", async (req, reply) => {
    const ctx = requireAuth(req);
    const { id } = IdParam.parse(req.params);
    const row = getDb()
      .select({
        userId: bookmarks.userId,
        path: bookmarks.snapshotScreenshotPath,
      })
      .from(bookmarks)
      .where(
        and(
          eq(bookmarks.id, id),
          eq(bookmarks.userId, ctx.userId),
          isNull(bookmarks.deletedAt),
        ),
      )
      .get();
    if (!row || !row.path) throw NotFound("Screenshot not ready");
    const sealed = await readBlob(row.path);
    const png = aeadDecrypt(
      ctx.dek,
      sealed,
      `${ctx.userId}|snapshot.screenshot`,
    );
    reply
      .header("content-type", "image/png")
      .header("cache-control", "private, max-age=300")
      .send(png);
  });

  app.get("/bookmarks/:id/icon", async (req, reply) => {
    const ctx = requireAuth(req);
    const { id } = IdParam.parse(req.params);
    const row = getDb()
      .select({
        userId: bookmarks.userId,
        path: bookmarks.iconBlobPath,
      })
      .from(bookmarks)
      .where(
        and(
          eq(bookmarks.id, id),
          eq(bookmarks.userId, ctx.userId),
          isNull(bookmarks.deletedAt),
        ),
      )
      .get();
    if (!row || !row.path) throw NotFound("Icon not set");
    let png: Buffer;
    try {
      const sealed = await readBlob(row.path);
      png = aeadDecrypt(ctx.dek, sealed, `${ctx.userId}|bookmark.icon`);
    } catch {
      // Stale path (file missing) or AAD mismatch from an older code path.
      // Clear the reference so the favicon job re-fetches on the next chance.
      getDb()
        .update(bookmarks)
        .set({ iconBlobPath: null })
        .where(eq(bookmarks.id, id))
        .run();
      throw NotFound("Icon could not be loaded; will be re-fetched");
    }
    reply
      .header("content-type", detectImageContentType(png))
      .header("cache-control", "private, max-age=86400")
      .send(png);
  });
};

function detectImageContentType(buf: Buffer): string {
  if (buf.length >= 8 && buf.subarray(0, 8).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]))) return "image/png";
  if (buf.length >= 3 && buf[0] === 0xff && buf[1] === 0xd8 && buf[2] === 0xff) return "image/jpeg";
  if (buf.length >= 4 && buf.subarray(0, 4).toString("ascii") === "GIF8") return "image/gif";
  if (buf.length >= 12 && buf.subarray(0, 4).toString("ascii") === "RIFF" && buf.subarray(8, 12).toString("ascii") === "WEBP") return "image/webp";
  if (buf.length >= 4 && buf.subarray(0, 4).toString("ascii").includes("<svg")) return "image/svg+xml";
  return "application/octet-stream";
}
