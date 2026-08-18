import type { StorageUsage } from "@awesome-bookmarks/shared";
import type { FastifyPluginAsync } from "fastify";
import { z } from "zod";
import { requireAuth } from "../auth/session.js";
import { quotaFor, totalOf, usageFor } from "./usage.js";

const Query = z.object({
  /** Skip the five-minute cache and re-walk the blob tree. */
  fresh: z
    .union([z.boolean(), z.enum(["1", "0", "true", "false"])])
    .transform((v) => v === true || v === "1" || v === "true")
    .optional(),
});

/** Every user can see their own consumption; only admins see anyone else's. */
export const storageRoutes: FastifyPluginAsync = async (app) => {
  app.get("/storage/me", async (req): Promise<StorageUsage> => {
    const ctx = requireAuth(req);
    const { fresh } = Query.parse(req.query ?? {});
    const breakdown = await usageFor(ctx.userId, { fresh });
    const quota = quotaFor(ctx.userId);
    return {
      userId: ctx.userId,
      usedBytes: totalOf(breakdown),
      quotaBytes: quota.bytes,
      quotaSource: quota.source,
      breakdown,
    };
  });
};
