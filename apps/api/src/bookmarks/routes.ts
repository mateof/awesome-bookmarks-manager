import {
  CreateBookmarkBodySchema,
  ListBookmarksQuerySchema,
  UpdateBookmarkBodySchema,
} from "@awesome-bookmarks/shared";
import type { FastifyPluginAsync } from "fastify";
import { z } from "zod";
import { requireAuth } from "../auth/session.js";
import { storeBookmarkIcon } from "../storage/icons.js";
import { BadRequest } from "../util/errors.js";
import {
  createBookmark,
  deleteBookmark,
  getBookmark,
  listBookmarks,
  refreshSnapshot,
  setBookmarkIconPath,
  updateBookmark,
} from "./service.js";

const IdParam = z.object({ id: z.string().uuid() });

export const bookmarkRoutes: FastifyPluginAsync = async (app) => {
  app.get("/bookmarks", async (req) => {
    const ctx = requireAuth(req);
    const q = ListBookmarksQuerySchema.parse(req.query);
    return listBookmarks(ctx, q);
  });

  app.get("/bookmarks/:id", async (req) => {
    const ctx = requireAuth(req);
    const { id } = IdParam.parse(req.params);
    return getBookmark(ctx, id);
  });

  app.post("/bookmarks", async (req, reply) => {
    const ctx = requireAuth(req);
    const body = CreateBookmarkBodySchema.parse(req.body);
    const b = createBookmark(ctx, body);
    reply.code(201);
    return b;
  });

  app.patch("/bookmarks/:id", async (req) => {
    const ctx = requireAuth(req);
    const { id } = IdParam.parse(req.params);
    const body = UpdateBookmarkBodySchema.parse(req.body);
    return updateBookmark(ctx, id, body);
  });

  app.delete("/bookmarks/:id", async (req, reply) => {
    const ctx = requireAuth(req);
    const { id } = IdParam.parse(req.params);
    deleteBookmark(ctx, id);
    reply.code(204);
  });

  app.post("/bookmarks/:id/refresh-snapshot", async (req) => {
    const ctx = requireAuth(req);
    const { id } = IdParam.parse(req.params);
    refreshSnapshot(ctx, id);
    return { ok: true };
  });

  app.post("/bookmarks/:id/icon", async (req) => {
    const ctx = requireAuth(req);
    const { id } = IdParam.parse(req.params);
    if (!req.isMultipart()) throw BadRequest("multipart/form-data expected");
    const file = await req.file();
    if (!file) throw BadRequest("file part missing");
    getBookmark(ctx, id);
    const path = await storeBookmarkIcon(ctx.userId, ctx.dek, id, file);
    setBookmarkIconPath(ctx, id, path);
    return { iconBlobPath: path };
  });
};
