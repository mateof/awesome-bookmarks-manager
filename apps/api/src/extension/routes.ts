import {
  CreateExtensionTokenBodySchema,
  QuickAddBodySchema,
} from "@awesome-bookmarks/shared";
import type { FastifyPluginAsync } from "fastify";
import { z } from "zod";
import { requireApiAuth } from "../auth/api-auth.js";
import { requireAuth } from "../auth/session.js";
import { createBookmark } from "../bookmarks/service.js";
import { createTag, listTags } from "../tags/service.js";
import {
  createToken,
  listTokens,
  revokeToken,
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
    // Pass the live DEK so the token can unlock data headlessly later.
    const token = createToken(ctx.userId, body.label, ctx.dek);
    reply.code(201);
    return { token, label: body.label };
  });

  app.delete("/extension/tokens/:id", async (req, reply) => {
    const ctx = requireAuth(req);
    const { id } = IdParam.parse(req.params);
    revokeToken(ctx.userId, id);
    reply.code(204);
  });

  // Quick-add — token-authenticated. Tokens minted after headless DEK
  // wrapping self-warm the DEK, so this keeps working across the idle
  // timeout without a web login.
  app.post("/ext/quick-add", async (req) => {
    const ctx = requireApiAuth(req);
    const body = QuickAddBodySchema.parse(req.body);

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
