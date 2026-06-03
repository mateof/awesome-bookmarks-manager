import {
  CreateShareBodySchema,
  PublicShareUnlockBodySchema,
} from "@awesome-bookmarks/shared";
import type { FastifyPluginAsync } from "fastify";
import { z } from "zod";
import { requireAuth } from "../auth/session.js";
import {
  createShare,
  deleteShare,
  listShares,
  resolvePublicShare,
} from "./service.js";

const IdParam = z.object({ id: z.string().uuid() });
const TokenParam = z.object({ token: z.string().min(1).max(256) });

export const shareRoutes: FastifyPluginAsync = async (app) => {
  app.get("/shares", async (req) => {
    const ctx = requireAuth(req);
    return listShares(ctx);
  });

  app.post("/shares", async (req, reply) => {
    const ctx = requireAuth(req);
    const body = CreateShareBodySchema.parse(req.body);
    const share = await createShare(ctx, body);
    reply.code(201);
    return share;
  });

  app.delete("/shares/:id", async (req, reply) => {
    const ctx = requireAuth(req);
    const { id } = IdParam.parse(req.params);
    deleteShare(ctx, id);
    reply.code(204);
  });

  // Public route — no auth.
  app.get("/share/:token", { config: { rateLimit: { max: 60, timeWindow: "1 minute" } } }, async (req) => {
    const { token } = TokenParam.parse(req.params);
    const passwordHeader = req.headers["x-share-password"];
    const password = typeof passwordHeader === "string" ? passwordHeader : undefined;
    return resolvePublicShare(token, password);
  });

  app.post("/share/:token/unlock", async (req) => {
    const { token } = TokenParam.parse(req.params);
    const body = PublicShareUnlockBodySchema.parse(req.body);
    return resolvePublicShare(token, body.password);
  });
};
