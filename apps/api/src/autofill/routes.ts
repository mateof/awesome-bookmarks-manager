import {
  ApproveAutomationBodySchema,
  CaptureFormBodySchema,
  captureFormFields,
  AutomationInputSchema,
  SaveAutofillVariablesBodySchema,
  runAutomationSteps,
} from "@awesome-bookmarks/shared";
import type { FastifyPluginAsync } from "fastify";
import { z } from "zod";
import { requireAutofillAuth } from "../auth/api-auth.js";
import { requireAuth } from "../auth/session.js";
import {
  approveAutomation,
  autofillRuntime,
  captureIntoAutomation,
  deleteAutomation,
  getAutomation,
  listAutomationSummaries,
  listVariables,
  saveVariables,
  setAutomation,
  variableUsage,
} from "./service.js";

const IdParam = z.object({ id: z.string().uuid() });

const CAPTURE_JS = `var __name = function (f) { return f; };
globalThis.__abCaptureFormFields = ${captureFormFields.toString()};
`;

const RUNNER_JS = `var __name = function (f) { return f; };
globalThis.__abRunAutomationSteps = ${runAutomationSteps.toString()};
`;

export const autofillRoutes: FastifyPluginAsync = async (app) => {
  app.get("/autofill/variables", async (req) => listVariables(requireAuth(req)));

  app.get("/autofill/variables/usage", async (req) => variableUsage(requireAuth(req)));

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

  app.get("/ext/autofill/capture.js", async (_req, reply) => {
    reply.type("application/javascript; charset=utf-8");
    return CAPTURE_JS;
  });

  app.post("/ext/autofill/capture", async (req) => {
    const ctx = requireAutofillAuth(req);
    return captureIntoAutomation(ctx, CaptureFormBodySchema.parse(req.body));
  });

};
