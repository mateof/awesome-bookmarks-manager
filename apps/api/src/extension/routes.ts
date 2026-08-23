import {
  CreateExtensionTokenBodySchema,
  CreateFolderBodySchema,
  QuickAddBodySchema,
} from "@awesome-bookmarks/shared";
import type { FastifyPluginAsync } from "fastify";
import { z } from "zod";
import { requireApiAuth } from "../auth/api-auth.js";
import { requireAuth } from "../auth/session.js";
import { createBookmark } from "../bookmarks/service.js";
import { createFolder, listFolders } from "../folders/service.js";
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

  // Folder picker for the extension — token-authenticated. Returns a light
  // list (id, parentId, name) so the popup can offer a "save into" dropdown
  // and build the hierarchy client-side.
  app.get("/ext/folders", async (req) => {
    const ctx = requireApiAuth(req);
    return listFolders(ctx).map((f) => ({
      id: f.id,
      parentId: f.parentId,
      name: f.name,
    }));
  });

  // Create a folder from the extension (under an existing folder, or at the
  // root when parentId is null/omitted). Token-authenticated.
  app.post("/ext/folders", async (req, reply) => {
    const ctx = requireApiAuth(req);
    const body = CreateFolderBodySchema.parse(req.body);
    const folder = createFolder(ctx, body);
    reply.code(201);
    return { id: folder.id, parentId: folder.parentId, name: folder.name };
  });

  // Tag list for the extension's autocomplete — token-authenticated.
  app.get("/ext/tags", async (req) => {
    const ctx = requireApiAuth(req);
    return listTags(ctx).map((t) => ({
      id: t.id,
      name: t.name,
      color: t.color,
    }));
  });

  // Create a tag (with a chosen colour) from the extension. Idempotent: if a
  // tag with that name already exists it's returned as-is, so the popup can
  // call this for "new" tags without worrying about races.
  app.post("/ext/tags", async (req, reply) => {
    const ctx = requireApiAuth(req);
    const body = z
      .object({
        name: z.string().trim().min(1).max(64),
        color: z.string().max(40).optional(),
      })
      .parse(req.body);
    const existing = listTags(ctx).find(
      (t) => t.name.toLowerCase() === body.name.toLowerCase(),
    );
    if (existing) {
      return { id: existing.id, name: existing.name, color: existing.color };
    }
    const created = createTag(ctx, {
      name: body.name,
      ...(body.color ? { color: body.color } : {}),
    });
    reply.code(201);
    return { id: created.id, name: created.name, color: created.color };
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
          const created = createTag(ctx, { name });
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
