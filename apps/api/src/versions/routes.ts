import { and, eq, inArray, isNull } from "drizzle-orm";
import type { FastifyPluginAsync } from "fastify";
import { z } from "zod";
import { requireAuth } from "../auth/session.js";
import {
  createBookmark,
  getBookmark,
  updateBookmark,
} from "../bookmarks/service.js";
import { getDb } from "../db/client.js";
import { bookmarks } from "../db/schema.js";
import {
  createFolder,
  getFolder,
  subtreeFolderIds,
  updateFolder,
} from "../folders/service.js";
import { BadRequest } from "../util/errors.js";
import {
  type BookmarkSnapshot,
  type FolderSnapshot,
  getVersion,
  listActivity,
  listVersions,
  recordVersion,
} from "./service.js";

const IdParam = z.object({ id: z.string().uuid() });
const VersionParams = z.object({
  id: z.string().uuid(),
  versionId: z.string().uuid(),
});
const VersionOnly = z.object({ versionId: z.string().uuid() });
const ForkFolderBody = z.object({ name: z.string().min(1).max(256).optional() });
const ForkBookmarkBody = z.object({
  title: z.string().min(1).max(1024).optional(),
  folderId: z.string().uuid().nullable().optional(),
});

export const versionRoutes: FastifyPluginAsync = async (app) => {
  app.get("/folders/:id/versions", async (req) => {
    const ctx = requireAuth(req);
    const { id } = IdParam.parse(req.params);
    const list = listVersions(ctx, "folder", id);
    if (list.length > 0) return list;
    // Entities created before versioning existed have no baseline, so the tab
    // looked empty even when the folder's subtree had activity. Record the
    // current state once (a lazy backfill — snapshots are DEK-sealed, so this
    // can only run for an authenticated owner, not at startup).
    const f = getFolder(ctx, id);
    recordVersion(ctx, "folder", id, f.rev, {
      name: f.name,
      description: f.description,
      bgColor: f.bgColor ?? null,
      tagIds: f.tagIds,
    });
    return listVersions(ctx, "folder", id);
  });

  app.get("/bookmarks/:id/versions", async (req) => {
    const ctx = requireAuth(req);
    const { id } = IdParam.parse(req.params);
    const list = listVersions(ctx, "bookmark", id);
    if (list.length > 0) return list;
    const b = getBookmark(ctx, id);
    recordVersion(ctx, "bookmark", id, b.rev, {
      title: b.title,
      url: b.url,
      description: b.description,
      bgColor: b.bgColor ?? null,
      folderId: b.folderId,
      tagIds: b.tagIds,
    });
    return listVersions(ctx, "bookmark", id);
  });

  app.get("/versions/:versionId", async (req) => {
    const ctx = requireAuth(req);
    const { versionId } = VersionOnly.parse(req.params);
    return getVersion(ctx, versionId);
  });

  // Restore an entity to a past version (bumps rev + records a new version).
  app.post("/folders/:id/versions/:versionId/restore", async (req) => {
    const ctx = requireAuth(req);
    const { id, versionId } = VersionParams.parse(req.params);
    const v = getVersion(ctx, versionId);
    if (v.entityType !== "folder" || v.entityId !== id) {
      throw BadRequest("Version does not belong to this folder");
    }
    const s = v.snapshot as FolderSnapshot;
    return updateFolder(ctx, id, {
      name: s.name,
      description: s.description,
      bgColor: s.bgColor,
      tagIds: s.tagIds,
    });
  });

  app.post("/bookmarks/:id/versions/:versionId/restore", async (req) => {
    const ctx = requireAuth(req);
    const { id, versionId } = VersionParams.parse(req.params);
    const v = getVersion(ctx, versionId);
    if (v.entityType !== "bookmark" || v.entityId !== id) {
      throw BadRequest("Version does not belong to this bookmark");
    }
    const s = v.snapshot as BookmarkSnapshot;
    return updateBookmark(ctx, id, {
      title: s.title,
      url: s.url,
      description: s.description,
      bgColor: s.bgColor,
      folderId: s.folderId,
      tagIds: s.tagIds,
    });
  });

  // Create a NEW entity from a past version (optionally renamed).
  app.post("/folders/:id/versions/:versionId/fork", async (req, reply) => {
    const ctx = requireAuth(req);
    const { id, versionId } = VersionParams.parse(req.params);
    const body = ForkFolderBody.parse(req.body ?? {});
    const v = getVersion(ctx, versionId);
    if (v.entityType !== "folder" || v.entityId !== id) {
      throw BadRequest("Version does not belong to this folder");
    }
    const s = v.snapshot as FolderSnapshot;
    const cur = getFolder(ctx, id);
    reply.code(201);
    return createFolder(ctx, {
      parentId: cur.parentId,
      name: body.name ?? s.name,
      description: s.description ?? undefined,
      bgColor: s.bgColor,
      tagIds: s.tagIds,
    });
  });

  app.post("/bookmarks/:id/versions/:versionId/fork", async (req, reply) => {
    const ctx = requireAuth(req);
    const { id, versionId } = VersionParams.parse(req.params);
    const body = ForkBookmarkBody.parse(req.body ?? {});
    const v = getVersion(ctx, versionId);
    if (v.entityType !== "bookmark" || v.entityId !== id) {
      throw BadRequest("Version does not belong to this bookmark");
    }
    const s = v.snapshot as BookmarkSnapshot;
    const cur = getBookmark(ctx, id);
    reply.code(201);
    return createBookmark(ctx, {
      folderId: body.folderId ?? cur.folderId,
      url: s.url,
      title: body.title ?? s.title,
      description: s.description ?? undefined,
      bgColor: s.bgColor,
      tagIds: s.tagIds,
      fetchSnapshot: false,
    });
  });

  // Activity across a folder's whole subtree (who/what/when).
  app.get("/folders/:id/activity", async (req) => {
    const ctx = requireAuth(req);
    const { id } = IdParam.parse(req.params);
    getFolder(ctx, id); // ownership
    const folderIds = subtreeFolderIds(ctx, id);
    const bmIds = getDb()
      .select({ id: bookmarks.id })
      .from(bookmarks)
      .where(
        and(
          eq(bookmarks.userId, ctx.userId),
          inArray(bookmarks.folderId, folderIds),
          isNull(bookmarks.deletedAt),
        ),
      )
      .all()
      .map((r) => r.id);
    return listActivity(ctx, [...folderIds, ...bmIds]);
  });
};
