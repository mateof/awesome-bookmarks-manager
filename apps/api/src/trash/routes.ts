import {
  PurgeTrashQuerySchema,
  RestoreTrashBodySchema,
} from "@awesome-bookmarks/shared";
import type { FastifyPluginAsync } from "fastify";
import { z } from "zod";
import { requireAuth } from "../auth/session.js";
import {
  listTrash,
  purgeOne,
  purgeTrash,
  restoreBookmark,
  restoreFolder,
  trashCount,
} from "./service.js";

const ItemParams = z.object({
  type: z.enum(["folder", "bookmark"]),
  id: z.string().uuid(),
});

const ListQuery = z.object({ rootLabel: z.string().max(60).optional() });

export const trashRoutes: FastifyPluginAsync = async (app) => {
  app.get("/trash", async (req) => {
    const ctx = requireAuth(req);
    const { rootLabel } = ListQuery.parse(req.query ?? {});
    return listTrash(ctx, rootLabel);
  });

  app.get("/trash/count", async (req) => ({
    count: trashCount(requireAuth(req)),
  }));

  app.post("/trash/restore", async (req) => {
    const ctx = requireAuth(req);
    const { type, id } = RestoreTrashBodySchema.parse(req.body);
    return type === "folder" ? restoreFolder(ctx, id) : restoreBookmark(ctx, id);
  });

  app.delete("/trash/:type/:id", async (req, reply) => {
    const ctx = requireAuth(req);
    const { type, id } = ItemParams.parse(req.params);
    await purgeOne(ctx, type, id);
    reply.code(204);
  });

  app.delete("/trash", async (req) => {
    const ctx = requireAuth(req);
    const { olderThanDays } = PurgeTrashQuerySchema.parse(req.query ?? {});
    return purgeTrash(ctx, { olderThanDays });
  });
};
