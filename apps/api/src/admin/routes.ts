import { UpdateUserRoleBodySchema } from "@awesome-bookmarks/shared";
import type { FastifyPluginAsync } from "fastify";
import { z } from "zod";
import { requireAuth } from "../auth/session.js";
import {
  deleteJobsByStatus,
  deleteUser,
  listAllJobs,
  listAllUsers,
  setUserRole,
} from "./service.js";

const IdParam = z.object({ id: z.string().uuid() });

export const adminRoutes: FastifyPluginAsync = async (app) => {
  app.get("/admin/users", async (req) => {
    const ctx = requireAuth(req);
    return listAllUsers(ctx);
  });

  app.delete("/admin/users/:id", async (req, reply) => {
    const ctx = requireAuth(req);
    const { id } = IdParam.parse(req.params);
    await deleteUser(ctx, id);
    reply.code(204);
  });

  const JobsQuery = z.object({
    status: z.string().optional(),
    type: z.string().optional(),
    limit: z.coerce.number().int().min(1).max(500).optional(),
  });
  app.get("/admin/jobs", async (req) => {
    const ctx = requireAuth(req);
    const q = JobsQuery.parse(req.query);
    return listAllJobs(ctx, q);
  });

  const DeleteJobsQuery = z.object({
    status: z.enum(["pending", "pending_user_key", "running", "done", "error"]),
  });
  app.delete("/admin/jobs", async (req) => {
    const ctx = requireAuth(req);
    const { status } = DeleteJobsQuery.parse(req.query);
    return deleteJobsByStatus(ctx, status);
  });

  app.patch("/admin/users/:id/role", async (req) => {
    const ctx = requireAuth(req);
    const { id } = IdParam.parse(req.params);
    const body = UpdateUserRoleBodySchema.parse(req.body);
    setUserRole(ctx, id, body.role);
    return { ok: true };
  });
};
