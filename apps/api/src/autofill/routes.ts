import {
  ApproveAutomationBodySchema,
  AutomationInputSchema,
  SaveAutofillVariablesBodySchema,
  runAutomationSteps,
} from "@awesome-bookmarks/shared";
import type { FastifyPluginAsync } from "fastify";
import { z } from "zod";
import { requireApiAuth, requireAutofillAuth } from "../auth/api-auth.js";
import { requireAuth } from "../auth/session.js";
import {
  approveAutomation,
  autofillRuntime,
  deleteAutomation,
  findBookmarkIdsForUrl,
  getAutomation,
  listAutomationSummaries,
  listVariables,
  saveVariables,
  setAutomation,
} from "./service.js";

const IdParam = z.object({ id: z.string().uuid() });
const UrlQuery = z.object({ url: z.string().url().max(8192) });

const RUNNER_JS = `var __name = function (f) { return f; };
globalThis.__abRunAutomationSteps = ${runAutomationSteps.toString()};
`;

export const autofillRoutes: FastifyPluginAsync = async (app) => {
  app.get("/autofill/variables", async (req) => listVariables(requireAuth(req)));

  app.put("/autofill/variables", async (req) => {
    const ctx = requireAuth(req);
    const body = SaveAutofillVariablesBodySchema.parse(req.body);
    return saveVariables(ctx, body.variables);
  });

  app.get("/automations", async (req) => listAutomationSummaries(requireAuth(req)));

  app.get("/bookmarks/:id/automation", async (req) => {
    const ctx = requireAuth(req);
    const { id } = IdParam.parse(req.params);
    return { automation: getAutomation(ctx, id) };
  });

  app.put("/bookmarks/:id/automation", async (req) => {
    const ctx = requireAuth(req);
    const { id } = IdParam.parse(req.params);
    const body = AutomationInputSchema.parse(req.body);
    return setAutomation(ctx, id, body, { approve: true });
  });

  app.post("/bookmarks/:id/automation/approve", async (req) => {
    const ctx = requireAuth(req);
    const { id } = IdParam.parse(req.params);
    const { fingerprint } = ApproveAutomationBodySchema.parse(req.body);
    return approveAutomation(ctx, id, fingerprint);
  });

  app.delete("/bookmarks/:id/automation", async (req, reply) => {
    const ctx = requireAuth(req);
    const { id } = IdParam.parse(req.params);
    deleteAutomation(ctx, id);
    reply.code(204);
  });

  app.get("/ext/autofill", async (req, reply) => {
    const ctx = requireAutofillAuth(req);
    reply.header("cache-control", "no-store");
    return autofillRuntime(ctx);
  });

  app.get("/ext/autofill/runner.js", async (_req, reply) => {
    reply.type("application/javascript; charset=utf-8");
    return RUNNER_JS;
  });

  app.get("/ext/bookmarks/match", async (req) => {
    const ctx = requireApiAuth(req);
    const { url } = UrlQuery.parse(req.query);
    return findBookmarkIdsForUrl(ctx, url);
  });
};
