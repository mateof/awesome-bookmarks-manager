import type { FastifyPluginAsync } from "fastify";
import { z } from "zod";
import { requireAuth } from "../auth/session.js";
import { searchRows } from "../databases/service.js";
import { search } from "./service.js";

const Query = z.object({
  q: z.string().min(1).max(256),
  limit: z.coerce.number().int().min(1).max(100).default(50),
  folderId: z.string().uuid().optional(),
});

export const searchRoutes: FastifyPluginAsync = async (app) => {
  /**
   * Text inside tables, as its own endpoint.
   *
   * Not folded into `/search`, whose shape is read by the palette, the search
   * page and the reference picker: a row is not a bookmark and pretending
   * otherwise would either lie about the type or change a payload three
   * screens already depend on. Callers that want both ask for both.
   */
  app.get("/search/rows", async (req) => {
    const ctx = requireAuth(req);
    const { q, limit } = Query.parse(req.query);
    return searchRows(ctx, q, Math.min(limit, 30));
  });

  app.get("/search", async (req) => {
    const ctx = requireAuth(req);
    const { q, limit, folderId } = Query.parse(req.query);
    return search(ctx, q, limit, { folderId: folderId ?? null });
  });
};
