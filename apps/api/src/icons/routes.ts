import type { FastifyPluginAsync } from "fastify";
import { z } from "zod";
import { requireAuth } from "../auth/session.js";
import { fetchFaviconBytes } from "../jobs/handlers/favicon.js";
import { NotFound } from "../util/errors.js";

const Body = z.object({
  url: z.string().url().max(8192),
});

export const iconRoutes: FastifyPluginAsync = async (app) => {
  /**
   * On-demand favicon fetch. The frontend calls this from the bookmark
   * dialog ("descargar icono de la web") to get the bytes back so it can
   * upload them through the existing icon-upload endpoint.
   *
   * Rate-limited to keep the instance from being used as an arbitrary
   * outbound HTTP client by an attacker who already has a session.
   */
  app.post(
    "/icons/fetch-favicon",
    { config: { rateLimit: { max: 30, timeWindow: "1 minute" } } },
    async (req, reply) => {
      requireAuth(req);
      const body = Body.parse(req.body);
      const result = await fetchFaviconBytes(body.url);
      if (!result) {
        throw NotFound("No se encontró un favicon válido en esa URL");
      }
      reply
        .header("content-type", result.contentType)
        .header("cache-control", "no-store")
        .send(result.bytes);
    },
  );
};
