import {
  CreateFolderBodySchema,
  MoveFolderBodySchema,
  UpdateFolderBodySchema,
} from "@awesome-bookmarks/shared";
import { aeadDecrypt } from "@awesome-bookmarks/crypto";
import { and, eq, isNull } from "drizzle-orm";
import type { FastifyPluginAsync } from "fastify";
import { z } from "zod";
import { requireAuth } from "../auth/session.js";
import { getDb } from "../db/client.js";
import { folders } from "../db/schema.js";
import { readBlob } from "../storage/blobs.js";
import { storeFolderBgImage, storeFolderIcon } from "../storage/icons.js";
import { copyFolderTree } from "./copy.js";
import { BadRequest, NotFound } from "../util/errors.js";
import { detectImageContentType, imageNotModified } from "../util/image.js";
import {
  createFolder,
  deleteFolder,
  getFolder,
  listFolders,
  moveFolder,
  setFolderBgImagePath,
  setFolderIconPath,
  updateFolder,
} from "./service.js";

const IdParam = z.object({ id: z.string().uuid() });

export const folderRoutes: FastifyPluginAsync = async (app) => {
  app.get("/folders", async (req) => {
    const ctx = requireAuth(req);
    return listFolders(ctx);
  });

  app.get("/folders/:id", async (req) => {
    const ctx = requireAuth(req);
    const { id } = IdParam.parse(req.params);
    return getFolder(ctx, id);
  });

  app.post("/folders", async (req, reply) => {
    const ctx = requireAuth(req);
    const body = CreateFolderBodySchema.parse(req.body);
    const folder = createFolder(ctx, body);
    reply.code(201);
    return folder;
  });

  app.patch("/folders/:id", async (req) => {
    const ctx = requireAuth(req);
    const { id } = IdParam.parse(req.params);
    const body = UpdateFolderBodySchema.parse(req.body);
    return updateFolder(ctx, id, body);
  });

  app.post("/folders/:id/move", async (req) => {
    const ctx = requireAuth(req);
    const { id } = IdParam.parse(req.params);
    const body = MoveFolderBodySchema.parse(req.body);
    moveFolder(ctx, id, body.newParentId, body.position);
    return { ok: true };
  });

  app.post("/folders/:id/copy", async (req, reply) => {
    const ctx = requireAuth(req);
    const { id } = IdParam.parse(req.params);
    const body = z
      .object({ parentId: z.string().uuid().nullable().optional() })
      .parse(req.body ?? {});
    reply.code(201);
    return copyFolderTree(ctx, id, body.parentId ?? null);
  });

  app.delete("/folders/:id", async (req, reply) => {
    const ctx = requireAuth(req);
    const { id } = IdParam.parse(req.params);
    deleteFolder(ctx, id);
    reply.code(204);
  });

  app.post("/folders/:id/icon", async (req) => {
    const ctx = requireAuth(req);
    const { id } = IdParam.parse(req.params);
    if (!req.isMultipart()) throw BadRequest("multipart/form-data expected");
    const file = await req.file();
    if (!file) throw BadRequest("file part missing");
    // Ownership check
    getFolder(ctx, id);
    const path = await storeFolderIcon(ctx.userId, ctx.dek, id, file);
    setFolderIconPath(ctx, id, path);
    return { iconBlobPath: path };
  });

  app.get("/folders/:id/icon", async (req, reply) => {
    const ctx = requireAuth(req);
    const { id } = IdParam.parse(req.params);
    const row = getDb()
      .select({ path: folders.iconBlobPath, updatedAt: folders.updatedAt })
      .from(folders)
      .where(
        and(
          eq(folders.id, id),
          eq(folders.userId, ctx.userId),
          isNull(folders.deletedAt),
        ),
      )
      .get();
    if (!row || !row.path) throw NotFound("Icon not set");
    if (imageNotModified(req, reply, row.updatedAt)) return;
    const sealed = await readBlob(row.path);
    const png = aeadDecrypt(ctx.dek, sealed, `${ctx.userId}|folder.icon`);
    reply.header("content-type", detectImageContentType(png));
    return reply.send(png);
  });

  app.post("/folders/:id/bg-image", async (req) => {
    const ctx = requireAuth(req);
    const { id } = IdParam.parse(req.params);
    if (!req.isMultipart()) throw BadRequest("multipart/form-data expected");
    const file = await req.file();
    if (!file) throw BadRequest("file part missing");
    getFolder(ctx, id);
    const path = await storeFolderBgImage(ctx.userId, ctx.dek, id, file);
    setFolderBgImagePath(ctx, id, path);
    return { imageBlobPath: path };
  });

  app.delete("/folders/:id/bg-image", async (req, reply) => {
    const ctx = requireAuth(req);
    const { id } = IdParam.parse(req.params);
    setFolderBgImagePath(ctx, id, null);
    reply.code(204);
  });

  app.get("/folders/:id/bg-image", async (req, reply) => {
    const ctx = requireAuth(req);
    const { id } = IdParam.parse(req.params);
    const row = getDb()
      .select({ path: folders.imageBlobPath, updatedAt: folders.updatedAt })
      .from(folders)
      .where(
        and(
          eq(folders.id, id),
          eq(folders.userId, ctx.userId),
          isNull(folders.deletedAt),
        ),
      )
      .get();
    if (!row || !row.path) throw NotFound("Background not set");
    if (imageNotModified(req, reply, row.updatedAt)) return;
    const sealed = await readBlob(row.path);
    const bytes = aeadDecrypt(ctx.dek, sealed, `${ctx.userId}|folder.bg`);
    reply.header("content-type", detectImageContentType(bytes));
    return reply.send(bytes);
  });
};
