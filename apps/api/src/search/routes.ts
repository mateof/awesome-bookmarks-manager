import type { FastifyPluginAsync } from "fastify";
import { z } from "zod";
import { requireAuth } from "../auth/session.js";
import { search } from "./service.js";

const Query = z.object({
  q: z.string().min(1).max(256),
  limit: z.coerce.number().int().min(1).max(100).default(50),
  folderId: z.string().uuid().optional(),
});

export const searchRoutes: FastifyPluginAsync = async (app) => {
  app.get("/search", async (req) => {
    const ctx = requireAuth(req);
    const { q, limit, folderId } = Query.parse(req.query);
    return search(ctx, q, limit, { folderId: folderId ?? null });
  });
};
