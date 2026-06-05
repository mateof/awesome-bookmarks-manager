import type { FastifyPluginAsync } from "fastify";
import { request as undiciRequest } from "undici";
import { z } from "zod";
import { requireAuth } from "../auth/session.js";
import { fetchFaviconBytes } from "../jobs/handlers/favicon.js";
import { BadRequest, NotFound } from "../util/errors.js";

const Body = z.object({
  url: z.string().url().max(8192),
});

const MAX_IMAGE_BYTES = 4 * 1024 * 1024; // 4 MB hard cap for fetched images
const ALLOWED_IMAGE_CT = /^image\/(png|jpeg|jpg|gif|webp|svg\+xml|x-icon|vnd\.microsoft\.icon)$/i;

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

  /**
   * Generic image-by-URL fetch. The frontend calls this when the user
   * pastes a direct image URL into the icon picker. Same rate-limit and
   * auth requirements as favicon; with a hard size cap and a strict
   * content-type allowlist so we don't act as an open proxy.
   */
  app.post(
    "/icons/fetch-image",
    { config: { rateLimit: { max: 30, timeWindow: "1 minute" } } },
    async (req, reply) => {
      requireAuth(req);
      const body = Body.parse(req.body);

      let res;
      try {
        res = await undiciRequest(body.url, {
          method: "GET",
          maxRedirections: 5,
          headers: {
            "user-agent": "AwesomeBookmarks/1.0 (icon fetcher)",
            accept: "image/*",
          },
          headersTimeout: 10_000,
          bodyTimeout: 15_000,
        });
      } catch {
        throw BadRequest("No se pudo descargar la imagen");
      }

      if (res.statusCode >= 400) {
        throw BadRequest(`La URL respondió ${res.statusCode}`);
      }

      const contentType = String(
        res.headers["content-type"] ?? "application/octet-stream",
      )
        .split(";")[0]!
        .trim();
      if (!ALLOWED_IMAGE_CT.test(contentType)) {
        throw BadRequest(`Tipo de contenido no soportado: ${contentType}`);
      }

      const declared = Number(res.headers["content-length"]);
      if (Number.isFinite(declared) && declared > MAX_IMAGE_BYTES) {
        throw BadRequest("La imagen excede 4MB");
      }

      const chunks: Buffer[] = [];
      let total = 0;
      for await (const chunk of res.body) {
        const buf = Buffer.isBuffer(chunk)
          ? chunk
          : Buffer.from(chunk as Uint8Array);
        total += buf.length;
        if (total > MAX_IMAGE_BYTES) {
          throw BadRequest("La imagen excede 4MB");
        }
        chunks.push(buf);
      }

      reply
        .header("content-type", contentType)
        .header("cache-control", "no-store")
        .send(Buffer.concat(chunks));
    },
  );
};
