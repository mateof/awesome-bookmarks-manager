import type { FastifyPluginAsync } from "fastify";
import { z } from "zod";
import { requireAuth } from "../auth/session.js";
import { createBookmarkAlias, createFolderAlias } from "./service.js";

const CreateAliasBody = z.object({
  targetType: z.enum(["folder", "bookmark"]),
  targetId: z.string().uuid(),
  /** Destination folder; null/omitted puts the link at the root. */
  parentId: z.string().uuid().nullable().optional(),
});

/** Symlinks to an existing folder/bookmark ("enlaces simbólicos"). */
export const aliasRoutes: FastifyPluginAsync = async (app) => {
  app.post("/aliases", async (req, reply) => {
    const ctx = requireAuth(req);
    const body = CreateAliasBody.parse(req.body);
    const parentId = body.parentId ?? null;
    reply.code(201);
    return body.targetType === "folder"
      ? createFolderAlias(ctx, body.targetId, parentId)
      : createBookmarkAlias(ctx, body.targetId, parentId);
  });
};
