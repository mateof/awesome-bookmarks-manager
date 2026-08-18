import { SecurityLogQuerySchema } from "@awesome-bookmarks/shared";
import type { FastifyPluginAsync } from "fastify";
import { z } from "zod";
import { ensureAdmin } from "../admin/service.js";
import { requireAuth } from "../auth/session.js";
import {
  getRetentionDays,
  pruneOldEvents,
  queryEvents,
  setRetentionDays,
  summarize,
} from "./service.js";

const SummaryQuery = z.object({
  hours: z.coerce.number().int().min(1).max(24 * 90).default(24),
});

/** Admin-only: the log describes the whole instance, not one account. */
export const securityLogRoutes: FastifyPluginAsync = async (app) => {
  app.get("/security-log", async (req) => {
    ensureAdmin(requireAuth(req));
    return queryEvents(SecurityLogQuerySchema.parse(req.query ?? {}));
  });

  app.get("/security-log/summary", async (req) => {
    ensureAdmin(requireAuth(req));
    const { hours } = SummaryQuery.parse(req.query ?? {});
    return summarize(hours);
  });

  app.get("/security-log/retention", async (req) => {
    ensureAdmin(requireAuth(req));
    return { days: getRetentionDays() };
  });

  app.patch("/security-log/retention", async (req) => {
    ensureAdmin(requireAuth(req));
    const { days } = z
      .object({ days: z.number().int().min(1).max(3650) })
      .parse(req.body);
    setRetentionDays(days);
    return { days: getRetentionDays(), pruned: pruneOldEvents() };
  });
};
