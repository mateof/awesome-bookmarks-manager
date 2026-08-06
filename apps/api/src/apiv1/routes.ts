import {
  CreateBookmarkBodySchema,
  CreateFolderBodySchema,
  CreateTagBodySchema,
  ListBookmarksQuerySchema,
  MoveBookmarkBodySchema,
  MoveFolderBodySchema,
  UpdateBookmarkBodySchema,
  UpdateFolderBodySchema,
  UpdateTagBodySchema,
} from "@awesome-bookmarks/shared";
import type { FastifyPluginAsync } from "fastify";
import { z } from "zod";
import { requireApiAuth } from "../auth/api-auth.js";
import { getMe } from "../auth/service.js";
import {
  createBookmark,
  deleteBookmark,
  getBookmark,
  listBookmarks,
  moveBookmark,
  refreshSnapshot,
  updateBookmark,
} from "../bookmarks/service.js";
import {
  createFolder,
  deleteFolder,
  getFolder,
  listFolders,
  moveFolder,
  updateFolder,
} from "../folders/service.js";
import { search } from "../search/service.js";
import {
  createTag,
  deleteTag,
  listTags,
  updateTag,
} from "../tags/service.js";

const IdParam = z.object({ id: z.string().uuid() });
const SearchQuery = z.object({
  q: z.string().min(1).max(256),
  folderId: z.string().uuid().optional(),
  limit: z.coerce.number().int().min(1).max(100).default(50),
});

/**
 * Stable, documented public API. Authenticated with either a browser
 * session or an `Authorization: Bearer <token>` header. Meant for native
 * apps, scripts and the MCP server. Registered under /api/v1.
 */
export const apiV1Routes: FastifyPluginAsync = async (app) => {
  // --- identity ---
  app.get("/me", async (req) => {
    const ctx = requireApiAuth(req);
    return getMe(ctx.userId);
  });

  // --- folders ---
  app.get("/folders", async (req) => {
    const ctx = requireApiAuth(req);
    return listFolders(ctx);
  });

  app.get("/folders/:id", async (req) => {
    const ctx = requireApiAuth(req);
    const { id } = IdParam.parse(req.params);
    return getFolder(ctx, id);
  });

  app.post("/folders", async (req, reply) => {
    const ctx = requireApiAuth(req);
    const body = CreateFolderBodySchema.parse(req.body);
    reply.code(201);
    return createFolder(ctx, body);
  });

  app.patch("/folders/:id", async (req) => {
    const ctx = requireApiAuth(req);
    const { id } = IdParam.parse(req.params);
    const body = UpdateFolderBodySchema.parse(req.body);
    return updateFolder(ctx, id, body);
  });

  app.post("/folders/:id/move", async (req) => {
    const ctx = requireApiAuth(req);
    const { id } = IdParam.parse(req.params);
    const body = MoveFolderBodySchema.parse(req.body);
    moveFolder(ctx, id, body.newParentId, body.position);
    return { ok: true };
  });

  app.delete("/folders/:id", async (req, reply) => {
    const ctx = requireApiAuth(req);
    const { id } = IdParam.parse(req.params);
    deleteFolder(ctx, id);
    reply.code(204);
  });

  // --- bookmarks ---
  app.get("/bookmarks", async (req) => {
    const ctx = requireApiAuth(req);
    const q = ListBookmarksQuerySchema.parse(req.query);
    return listBookmarks(ctx, q);
  });

  app.get("/bookmarks/:id", async (req) => {
    const ctx = requireApiAuth(req);
    const { id } = IdParam.parse(req.params);
    return getBookmark(ctx, id);
  });

  app.post("/bookmarks", async (req, reply) => {
    const ctx = requireApiAuth(req);
    const body = CreateBookmarkBodySchema.parse(req.body);
    reply.code(201);
    return createBookmark(ctx, body);
  });

  app.patch("/bookmarks/:id", async (req) => {
    const ctx = requireApiAuth(req);
    const { id } = IdParam.parse(req.params);
    const body = UpdateBookmarkBodySchema.parse(req.body);
    return updateBookmark(ctx, id, body);
  });

  app.post("/bookmarks/:id/move", async (req) => {
    const ctx = requireApiAuth(req);
    const { id } = IdParam.parse(req.params);
    const body = MoveBookmarkBodySchema.parse(req.body);
    moveBookmark(ctx, id, body.newFolderId, body.position);
    return { ok: true };
  });

  app.post("/bookmarks/:id/refresh-snapshot", async (req) => {
    const ctx = requireApiAuth(req);
    const { id } = IdParam.parse(req.params);
    refreshSnapshot(ctx, id);
    return { ok: true };
  });

  app.delete("/bookmarks/:id", async (req, reply) => {
    const ctx = requireApiAuth(req);
    const { id } = IdParam.parse(req.params);
    deleteBookmark(ctx, id);
    reply.code(204);
  });

  // --- tags ---
  app.get("/tags", async (req) => {
    const ctx = requireApiAuth(req);
    return listTags(ctx);
  });

  app.post("/tags", async (req, reply) => {
    const ctx = requireApiAuth(req);
    const body = CreateTagBodySchema.parse(req.body);
    reply.code(201);
    return createTag(ctx, body);
  });

  app.patch("/tags/:id", async (req) => {
    const ctx = requireApiAuth(req);
    const { id } = IdParam.parse(req.params);
    const body = UpdateTagBodySchema.parse(req.body);
    return updateTag(ctx, id, body);
  });

  app.delete("/tags/:id", async (req, reply) => {
    const ctx = requireApiAuth(req);
    const { id } = IdParam.parse(req.params);
    deleteTag(ctx, id);
    reply.code(204);
  });

  // --- search ---
  app.get("/search", async (req) => {
    const ctx = requireApiAuth(req);
    const { q, folderId, limit } = SearchQuery.parse(req.query);
    return search(ctx, q, limit, { folderId: folderId ?? null });
  });
};
