import {
  CreateSmartFolderBodySchema,
  UpdateSmartFolderBodySchema,
} from "@awesome-bookmarks/shared";
import type { FastifyPluginAsync } from "fastify";
import { z } from "zod";
import { requireAuth } from "../auth/session.js";
import {
  createSmartFolder,
  deleteSmartFolder,
  getSmartFolder,
  listSmartFolders,
  updateSmartFolder,
} from "./service.js";

const IdParam = z.object({ id: z.string().uuid() });

export const smartFolderRoutes: FastifyPluginAsync = async (app) => {
  app.get("/smart-folders", async (req) => listSmartFolders(requireAuth(req)));

  app.get("/smart-folders/:id", async (req) => {
    const ctx = requireAuth(req);
    const { id } = IdParam.parse(req.params);
    return getSmartFolder(ctx, id);
  });

  app.post("/smart-folders", async (req, reply) => {
    const ctx = requireAuth(req);
    const body = CreateSmartFolderBodySchema.parse(req.body);
    reply.code(201);
    return createSmartFolder(ctx, body);
  });

  app.patch("/smart-folders/:id", async (req) => {
    const ctx = requireAuth(req);
    const { id } = IdParam.parse(req.params);
    const body = UpdateSmartFolderBodySchema.parse(req.body);
    return updateSmartFolder(ctx, id, body);
  });

  app.delete("/smart-folders/:id", async (req, reply) => {
    const ctx = requireAuth(req);
    const { id } = IdParam.parse(req.params);
    deleteSmartFolder(ctx, id);
    reply.code(204);
  });
};
