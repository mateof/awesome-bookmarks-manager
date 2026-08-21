import type { AttachmentEntity } from "@awesome-bookmarks/shared";
import type { FastifyPluginAsync } from "fastify";
import { z } from "zod";
import { requireAuth } from "../auth/session.js";
import { BadRequest } from "../util/errors.js";
import {
  addAttachment,
  deleteAttachment,
  listAttachments,
  readAttachment,
} from "./service.js";

const IdParam = z.object({ id: z.string().uuid() });

/**
 * Attachment routes.
 *
 * Listing and uploading hang off the parent (`/folders/:id/attachments`), so
 * ownership is checked against a row the user can be shown to own. Download
 * and delete address the attachment by its own id, which is enough: the row
 * carries `user_id` and every query filters on it.
 */
export const attachmentRoutes: FastifyPluginAsync = async (app) => {
  for (const entity of ["folder", "bookmark"] as AttachmentEntity[]) {
    const prefix = entity === "folder" ? "/folders" : "/bookmarks";

    app.get(`${prefix}/:id/attachments`, async (req) => {
      const ctx = requireAuth(req);
      const { id } = IdParam.parse(req.params);
      return listAttachments(ctx, entity, id);
    });

    app.post(`${prefix}/:id/attachments`, async (req, reply) => {
      const ctx = requireAuth(req);
      const { id } = IdParam.parse(req.params);
      if (!req.isMultipart()) throw BadRequest("multipart/form-data expected");
      const file = await req.file();
      if (!file) throw BadRequest("file part missing");
      reply.code(201);
      return addAttachment(ctx, entity, id, file);
    });
  }

  app.get("/attachments/:id", async (req, reply) => {
    const ctx = requireAuth(req);
    const { id } = IdParam.parse(req.params);
    const inline = z
      .object({ inline: z.enum(["0", "1"]).optional() })
      .parse(req.query).inline === "1";

    const att = await readAttachment(ctx, id);

    // Never serve a user-supplied content type. An uploaded .html would
    // otherwise render on this origin with the session cookie attached, which
    // is stored XSS with extra steps. Only bytes that sniff as a raster image
    // (so: not SVG, which can carry script) are allowed to render inline, and
    // then with the *sniffed* type rather than the declared one.
    const canInline = inline && att.imageType !== null;
    const disposition = canInline ? "inline" : "attachment";
    reply
      .header("content-type", canInline ? att.imageType! : "application/octet-stream")
      .header("x-content-type-options", "nosniff")
      .header(
        "content-disposition",
        `${disposition}; filename*=UTF-8''${encodeURIComponent(att.name)}`,
      )
      // Private: the bytes are this user's, and a shared cache must not keep
      // them. Revalidation is cheap because the id never points at new bytes.
      .header("cache-control", "private, max-age=300")
      .send(att.bytes);
  });

  app.delete("/attachments/:id", async (req, reply) => {
    const ctx = requireAuth(req);
    const { id } = IdParam.parse(req.params);
    await deleteAttachment(ctx, id);
    reply.code(204);
  });
};
