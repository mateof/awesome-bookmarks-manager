import type { FastifyRequest } from "fastify";
import { resolveToken } from "../extension/service.js";
import { KeyUnavailable, Unauthorized } from "../util/errors.js";
import { keyCache } from "./key-cache.js";
import type { AuthedContext } from "./session.js";
import { unwrapDekForToken } from "./token-crypto.js";

/**
 * Resolve a raw API token string into an authenticated context, unlocking
 * (and caching) the DEK from the token's envelope on first use. Shared by
 * the REST API and the MCP transport.
 */
export function authFromToken(token: string): AuthedContext {
  const resolved = resolveToken(token);
  if (!resolved) throw Unauthorized("Invalid API token");

  let dek = keyCache.get(resolved.userId);
  if (!dek) {
    if (!resolved.dekWrap) {
      // Legacy token minted before headless DEK wrapping.
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
    return authFromToken(authz.slice("Bearer ".length).trim());
  }

  throw Unauthorized();
}
