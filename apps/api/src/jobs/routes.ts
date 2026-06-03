import type { FastifyPluginAsync } from "fastify";
import { requireAuth } from "../auth/session.js";
import { listUserJobs } from "./queue.js";

export const jobRoutes: FastifyPluginAsync = async (app) => {
  app.get("/jobs", async (req) => {
    const ctx = requireAuth(req);
    return listUserJobs(ctx.userId);
  });
};
