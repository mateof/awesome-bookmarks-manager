import {
  CreateTagBodySchema,
  UpdateTagBodySchema,
} from "@awesome-bookmarks/shared";
import type { FastifyPluginAsync } from "fastify";
import { z } from "zod";
import { requireAuth } from "../auth/session.js";
import { createTag, deleteTag, listTags, updateTag } from "./service.js";

const IdParam = z.object({ id: z.string().uuid() });

export const tagRoutes: FastifyPluginAsync = async (app) => {
  app.get("/tags", async (req) => {
    const ctx = requireAuth(req);
    return listTags(ctx);
  });

  app.post("/tags", async (req, reply) => {
    const ctx = requireAuth(req);
    const body = CreateTagBodySchema.parse(req.body);
    const tag = createTag(ctx, body);
    reply.code(201);
    return tag;
  });

  app.patch("/tags/:id", async (req) => {
    const ctx = requireAuth(req);
    const { id } = IdParam.parse(req.params);
    const body = UpdateTagBodySchema.parse(req.body);
    return updateTag(ctx, id, body);
  });

  app.delete("/tags/:id", async (req, reply) => {
    const ctx = requireAuth(req);
    const { id } = IdParam.parse(req.params);
    deleteTag(ctx, id);
    reply.code(204);
  });
};
