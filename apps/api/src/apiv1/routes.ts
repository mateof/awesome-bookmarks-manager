import {
  CreateBookmarkBodySchema,
  CreateFolderBodySchema,
  CreateSmartFolderBodySchema,
  CreateTagBodySchema,
  ListBookmarksQuerySchema,
  MergeBookmarksBodySchema,
  MoveBookmarkBodySchema,
  MoveFolderBodySchema,
  PurgeTrashQuerySchema,
  RestoreTrashBodySchema,
  UpdateBookmarkBodySchema,
  UpdateFolderBodySchema,
  UpdateSmartFolderBodySchema,
  UpdateTagBodySchema,
} from "@awesome-bookmarks/shared";
import type { FastifyPluginAsync } from "fastify";
import { z } from "zod";
import { requireApiAuth } from "../auth/api-auth.js";
import { APP_VERSION } from "../util/app-version.js";
import { getMe } from "../auth/service.js";
import { findDuplicates, mergeBookmarks } from "../bookmarks/duplicates.js";
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
  createSmartFolder,
  deleteSmartFolder,
  getSmartFolder,
  listSmartFolders,
  resolveSmartFolder,
  updateSmartFolder,
} from "../smart-folders/service.js";
import {
  createTag,
  deleteTag,
  listTags,
  updateTag,
} from "../tags/service.js";
import {
  listTrash,
  purgeOne,
  purgeTrash,
  restoreBookmark,
  restoreFolder,
  trashCount,
} from "../trash/service.js";

const IdParam = z.object({ id: z.string().uuid() });
const SearchQuery = z.object({
  q: z.string().min(1).max(256),
  folderId: z.string().uuid().optional(),
  limit: z.coerce.number().int().min(1).max(100).default(50),
});
const TrashItemParams = z.object({
  type: z.enum(["folder", "bookmark"]),
  id: z.string().uuid(),
});

/**
 * Stable, documented public API. Authenticated with either a browser
 * session or an `Authorization: Bearer <token>` header. Meant for native
 * apps, scripts and the MCP server. Registered under /api/v1.
 */
export const apiV1Routes: FastifyPluginAsync = async (app) => {
  // --- server ---
  // Authenticated on purpose: there is no reason to tell the whole internet
  // which version is running, and every client that wants it is signed in.
  app.get("/version", async (req) => {
    requireApiAuth(req);
    return { version: APP_VERSION };
  });

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

  // Declared before `/bookmarks/:id` so the literal paths win over the param.
  app.get("/bookmarks/duplicates", async (req) => {
    const ctx = requireApiAuth(req);
    return findDuplicates(ctx);
  });

  app.post("/bookmarks/merge", async (req) => {
    const ctx = requireApiAuth(req);
    const { keepId, mergeIds } = MergeBookmarksBodySchema.parse(req.body);
    return mergeBookmarks(ctx, keepId, mergeIds);
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

  // --- smart folders (saved queries) ---
  app.get("/smart-folders", async (req) => {
    const ctx = requireApiAuth(req);
    return listSmartFolders(ctx);
  });

  app.get("/smart-folders/:id", async (req) => {
    const ctx = requireApiAuth(req);
    const { id } = IdParam.parse(req.params);
    return getSmartFolder(ctx, id);
  });

  // A smart folder stores a query, not a list. This evaluates it now, which
  // saves a client from downloading the whole library to answer "what is in
  // it?".
  app.get("/smart-folders/:id/items", async (req) => {
    const ctx = requireApiAuth(req);
    const { id } = IdParam.parse(req.params);
    return resolveSmartFolder(ctx, id);
  });

  app.post("/smart-folders", async (req, reply) => {
    const ctx = requireApiAuth(req);
    const body = CreateSmartFolderBodySchema.parse(req.body);
    reply.code(201);
    return createSmartFolder(ctx, body);
  });

  app.patch("/smart-folders/:id", async (req) => {
    const ctx = requireApiAuth(req);
    const { id } = IdParam.parse(req.params);
    const body = UpdateSmartFolderBodySchema.parse(req.body);
    return updateSmartFolder(ctx, id, body);
  });

  app.delete("/smart-folders/:id", async (req, reply) => {
    const ctx = requireApiAuth(req);
    const { id } = IdParam.parse(req.params);
    deleteSmartFolder(ctx, id);
    reply.code(204);
  });

  // --- trash ---
  app.get("/trash", async (req) => {
    const ctx = requireApiAuth(req);
    const { rootLabel } = z
      .object({ rootLabel: z.string().max(60).optional() })
      .parse(req.query ?? {});
    return listTrash(ctx, rootLabel);
  });

  app.get("/trash/count", async (req) => {
    const ctx = requireApiAuth(req);
    return { count: trashCount(ctx) };
  });

  app.post("/trash/restore", async (req) => {
    const ctx = requireApiAuth(req);
    const { type, id } = RestoreTrashBodySchema.parse(req.body);
    return type === "folder" ? restoreFolder(ctx, id) : restoreBookmark(ctx, id);
  });

  // Irreversible: these are the only calls in the API that destroy data
  // instead of moving it. Everything else is recoverable from the trash.
  app.delete("/trash/:type/:id", async (req, reply) => {
    const ctx = requireApiAuth(req);
    const { type, id } = TrashItemParams.parse(req.params);
    await purgeOne(ctx, type, id);
    reply.code(204);
  });

  app.delete("/trash", async (req) => {
    const ctx = requireApiAuth(req);
    const { olderThanDays } = PurgeTrashQuerySchema.parse(req.query ?? {});
    return purgeTrash(ctx, { olderThanDays });
  });

  // --- search ---
  app.get("/search", async (req) => {
    const ctx = requireApiAuth(req);
    const { q, folderId, limit } = SearchQuery.parse(req.query);
    return search(ctx, q, limit, { folderId: folderId ?? null });
  });
};
