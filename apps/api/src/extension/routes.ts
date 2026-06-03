import {
  CreateExtensionTokenBodySchema,
  QuickAddBodySchema,
} from "@awesome-bookmarks/shared";
import type { FastifyPluginAsync } from "fastify";
import { z } from "zod";
import { keyCache } from "../auth/key-cache.js";
import { requireAuth } from "../auth/session.js";
import { createBookmark } from "../bookmarks/service.js";
import { createTag, listTags } from "../tags/service.js";
import { KeyUnavailable, Unauthorized } from "../util/errors.js";
import {
  createToken,
  listTokens,
  revokeToken,
  verifyToken,
} from "./service.js";

const IdParam = z.object({ id: z.string().uuid() });

export const extensionRoutes: FastifyPluginAsync = async (app) => {
  // Manage extension tokens (browser-session authenticated).
  app.get("/extension/tokens", async (req) => {
    const ctx = requireAuth(req);
    return listTokens(ctx.userId);
  });

  app.post("/extension/tokens", async (req, reply) => {
    const ctx = requireAuth(req);
    const body = CreateExtensionTokenBodySchema.parse(req.body);
    const token = createToken(ctx.userId, body.label);
    reply.code(201);
    return { token, label: body.label };
  });

  app.delete("/extension/tokens/:id", async (req, reply) => {
    const ctx = requireAuth(req);
    const { id } = IdParam.parse(req.params);
    revokeToken(ctx.userId, id);
    reply.code(204);
  });

  // Quick-add — token-authenticated. Requires the user's DEK to be in cache,
  // since titles/urls are encrypted at rest. If the user has been offline long
  // enough that the DEK has been evicted, the request fails with 423 and the
  // user must log in via the web app to re-warm the cache.
  app.post("/ext/quick-add", async (req) => {
    const auth = req.headers.authorization;
    if (!auth || !auth.startsWith("Bearer ")) throw Unauthorized();
    const token = auth.slice("Bearer ".length);
    const userId = verifyToken(token);
    if (!userId) throw Unauthorized();
    const dek = keyCache.get(userId);
    if (!dek) throw KeyUnavailable();
    const body = QuickAddBodySchema.parse(req.body);

    const ctx = { userId, dek };

    let tagIds: string[] | undefined;
    if (body.tags && body.tags.length > 0) {
      const existing = listTags(ctx);
      const byName = new Map(existing.map((t) => [t.name.toLowerCase(), t.id]));
      tagIds = [];
      for (const name of body.tags) {
        const lower = name.toLowerCase();
        const id = byName.get(lower);
        if (id) {
          tagIds.push(id);
        } else {
          const created = createTag(ctx, { name, color: "#64748b" });
          tagIds.push(created.id);
          byName.set(lower, created.id);
        }
      }
    }

    return createBookmark(ctx, {
      url: body.url,
      title: body.title,
      folderId: body.folderId ?? null,
      tagIds,
      fetchSnapshot: true,
    });
  });
};
