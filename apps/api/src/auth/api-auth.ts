import type { FastifyRequest } from "fastify";
import { resolveToken } from "../extension/service.js";
import { KeyUnavailable, Unauthorized } from "../util/errors.js";
import { keyCache } from "./key-cache.js";
import type { AuthedContext } from "./session.js";
import { unwrapDekForToken } from "./token-crypto.js";

/**
 * Auth for the public /api/v1 surface. Accepts EITHER a browser session
 * cookie (so the web app can reuse it) OR an `Authorization: Bearer <token>`
 * header (native apps, MCP, scripts).
 *
 * For token auth the DEK is unlocked from the token's own envelope on first
 * use and cached, so a headless client keeps working across the DEK idle
 * timeout without any interactive login.
 */
export function requireApiAuth(req: FastifyRequest): AuthedContext {
  // 1. Session cookie (web app).
  const sessionUserId = req.session?.get("userId");
  if (sessionUserId) {
    const dek = keyCache.get(sessionUserId);
    if (dek) return { userId: sessionUserId, dek };
  }

  // 2. Bearer token (headless clients).
  const authz = req.headers.authorization;
  if (authz && authz.startsWith("Bearer ")) {
    const token = authz.slice("Bearer ".length).trim();
    const resolved = resolveToken(token);
    if (!resolved) throw Unauthorized("Invalid API token");

    let dek = keyCache.get(resolved.userId);
    if (!dek) {
      if (!resolved.dekWrap) {
        // Legacy token minted before headless DEK wrapping — the user has to
        // log into the web app once to warm the cache.
        throw KeyUnavailable();
      }
      dek = unwrapDekForToken(
        resolved.userId,
        resolved.tokenId,
        resolved.rawSecret,
        resolved.dekWrap,
      );
      keyCache.put(resolved.userId, dek);
    }
    return { userId: resolved.userId, dek };
  }

  throw Unauthorized();
}
