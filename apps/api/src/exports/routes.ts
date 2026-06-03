import type { FastifyPluginAsync } from "fastify";
import { z } from "zod";
import { requireAuth } from "../auth/session.js";
import { listBookmarks } from "../bookmarks/service.js";
import { listFolders } from "../folders/service.js";
import { BadRequest } from "../util/errors.js";
import { buildNetscapeHtml, safeFilename } from "./netscape.js";

const ExportBody = z
  .object({
    folderIds: z.array(z.string().uuid()).default([]),
    bookmarkIds: z.array(z.string().uuid()).default([]),
  })
  .refine((v) => v.folderIds.length > 0 || v.bookmarkIds.length > 0, {
    message: "Selecciona al menos una carpeta o bookmark",
  });

export const exportRoutes: FastifyPluginAsync = async (app) => {
  app.post("/export/bookmarks-html", async (req, reply) => {
    const ctx = requireAuth(req);
    const body = ExportBody.parse(req.body);
    const requestedFolders = new Set(body.folderIds);
    const requestedBookmarks = new Set(body.bookmarkIds);

    const folders = listFolders(ctx);
    const bookmarks = listBookmarks(ctx, {});

    const ownedFolderIds = new Set(folders.map((f) => f.id));
    const ownedBookmarkIds = new Set(bookmarks.map((b) => b.id));
    for (const id of requestedFolders) {
      if (!ownedFolderIds.has(id)) throw BadRequest(`Folder not found: ${id}`);
    }
    for (const id of requestedBookmarks) {
      if (!ownedBookmarkIds.has(id))
        throw BadRequest(`Bookmark not found: ${id}`);
    }

    let rootTitle = "Bookmarks";
    if (requestedFolders.size === 1 && requestedBookmarks.size === 0) {
      const only = folders.find((f) => f.id === [...requestedFolders][0]);
      if (only) rootTitle = only.name;
    } else if (requestedBookmarks.size === 1 && requestedFolders.size === 0) {
      const only = bookmarks.find((b) => b.id === [...requestedBookmarks][0]);
      if (only) rootTitle = only.title;
    }

    const html = buildNetscapeHtml({
      selectedFolderIds: requestedFolders,
      selectedBookmarkIds: requestedBookmarks,
      folders,
      bookmarks,
      rootTitle,
    });

    const filename = `${safeFilename(rootTitle)}.html`;
    reply.header("content-type", "text/html; charset=utf-8");
    reply.header(
      "content-disposition",
      `attachment; filename="${filename}"`,
    );
    return reply.send(html);
  });
};
