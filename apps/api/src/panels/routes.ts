import {
  CreatePanelBodySchema,
  CreateTemplateBodySchema,
  UpdatePanelBodySchema,
  UpdateTemplateBodySchema,
} from "@awesome-bookmarks/shared";
import type { FastifyPluginAsync } from "fastify";
import { z } from "zod";
import { requireAuth } from "../auth/session.js";
import { readBlob } from "../storage/blobs.js";
import { openPanelBgAsset, storePanelBgAsset } from "../storage/panel-assets.js";
import { BadRequest, NotFound } from "../util/errors.js";
import { imageEtag } from "../util/image.js";
import {
  clearPanelBgAsset,
  createPanel,
  deletePanel,
  getPanel,
  listPanels,
  panelBgForPublic,
  regeneratePanel,
  resolvePublicPanel,
  setPanelBgAsset,
  updatePanel,
} from "./service.js";
import {
  createTemplate,
  deleteTemplate,
  listTemplates,
  updateTemplate,
} from "./templates.js";

const IdParam = z.object({ id: z.string().uuid() });
const TplIdParam = z.object({ id: z.string().max(64) });
const SlugParam = z.object({ slug: z.string().max(64) });
const UnlockBody = z.object({ password: z.string().max(200).optional() });

export const panelRoutes: FastifyPluginAsync = async (app) => {
  app.get("/panels", async (req) => listPanels(requireAuth(req)));

  app.post("/panels", async (req, reply) => {
    const ctx = requireAuth(req);
    const body = CreatePanelBodySchema.parse(req.body);
    const panel = await createPanel(ctx, body);
    reply.code(201);
    return panel;
  });

  app.get("/panels/:id", async (req) => {
    const ctx = requireAuth(req);
    const { id } = IdParam.parse(req.params);
    return getPanel(ctx, id);
  });

  app.patch("/panels/:id", async (req) => {
    const ctx = requireAuth(req);
    const { id } = IdParam.parse(req.params);
    const body = UpdatePanelBodySchema.parse(req.body);
    return updatePanel(ctx, id, body);
  });

  app.post("/panels/:id/regenerate", async (req) => {
    const ctx = requireAuth(req);
    const { id } = IdParam.parse(req.params);
    return regeneratePanel(ctx, id);
  });

  app.delete("/panels/:id", async (req, reply) => {
    const ctx = requireAuth(req);
    const { id } = IdParam.parse(req.params);
    deletePanel(ctx, id);
    reply.code(204);
  });

  // Custom background asset (static image, GIF or short video).
  app.post("/panels/:id/background", async (req) => {
    const ctx = requireAuth(req);
    const { id } = IdParam.parse(req.params);
    if (!req.isMultipart()) throw BadRequest("multipart/form-data expected");
    const file = await req.file();
    if (!file) throw BadRequest("file part missing");
    getPanel(ctx, id); // ownership check (throws NotFound)
    const { path, mime } = await storePanelBgAsset(ctx.userId, id, file);
    return setPanelBgAsset(ctx, id, path, mime);
  });

  app.delete("/panels/:id/background", async (req) => {
    const ctx = requireAuth(req);
    const { id } = IdParam.parse(req.params);
    return clearPanelBgAsset(ctx, id);
  });

  // Templates (built-ins + the user's own).
  app.get("/panel-templates", async (req) => listTemplates(requireAuth(req)));

  app.post("/panel-templates", async (req, reply) => {
    const ctx = requireAuth(req);
    const body = CreateTemplateBodySchema.parse(req.body);
    reply.code(201);
    return createTemplate(ctx, body);
  });

  app.patch("/panel-templates/:id", async (req) => {
    const ctx = requireAuth(req);
    const { id } = TplIdParam.parse(req.params);
    const body = UpdateTemplateBodySchema.parse(req.body);
    return updateTemplate(ctx, id, body);
  });

  app.delete("/panel-templates/:id", async (req, reply) => {
    const ctx = requireAuth(req);
    const { id } = TplIdParam.parse(req.params);
    deleteTemplate(ctx, id);
    reply.code(204);
  });
};

/** Public viewing endpoints. Auth is optional (only "users" mode needs it). */
export const publicPanelRoutes: FastifyPluginAsync = async (app) => {
  app.get("/public/panel/:slug", async (req) => {
    const { slug } = SlugParam.parse(req.params);
    return resolvePublicPanel(slug, {
      viewerUserId: req.session.get("userId"),
    });
  });

  app.post("/public/panel/:slug", async (req) => {
    const { slug } = SlugParam.parse(req.params);
    const body = UnlockBody.parse(req.body ?? {});
    return resolvePublicPanel(slug, {
      password: body.password,
      viewerUserId: req.session.get("userId"),
    });
  });

  // Stream the custom background asset for a public panel (no DEK needed; the
  // blob is MASTER_KEY-sealed). Decorative, so it is served for public/password
  // panels and gated only for "users" panels.
  app.get("/public/panel/:slug/background", async (req, reply) => {
    const { slug } = SlugParam.parse(req.params);
    const info = panelBgForPublic(slug, req.session.get("userId"));
    if (!info) throw NotFound("Background not set");
    const etag = imageEtag(info.updatedAt);
    reply.header("etag", etag);
    reply.header("cache-control", "public, max-age=300");
    if (req.headers["if-none-match"] === etag) {
      reply.code(304).send();
      return;
    }
    const sealed = await readBlob(info.path);
    const bytes = openPanelBgAsset(info.ownerId, sealed);
    reply.header("content-type", info.mime);
    return reply.send(bytes);
  });
};
