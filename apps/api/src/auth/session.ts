import type { FastifyInstance, FastifyReply, FastifyRequest } from "fastify";
import { hkdf } from "@awesome-bookmarks/crypto";
import secureSession from "@fastify/secure-session";
import { getEnv } from "../env.js";
import { keyCache } from "./key-cache.js";
import { KeyUnavailable, Unauthorized } from "../util/errors.js";

declare module "@fastify/secure-session" {
  interface SessionData {
    userId: string;
    loginAt: number;
  }
}

export async function registerSession(app: FastifyInstance) {
  const env = getEnv();
  const key = hkdf(
    Buffer.from(env.SESSION_SECRET, "utf8"),
    Buffer.from("awesome-bookmarks/session"),
    "secure-session-key",
    32,
  );
  await app.register(secureSession, {
    key,
    cookie: {
      path: "/",
      httpOnly: true,
      sameSite: "lax",
      secure: env.COOKIE_SECURE,
      maxAge: 60 * 60 * 24 * 30, // 30 days
    },
  });
}

export function setSession(reply: FastifyReply, userId: string) {
  reply.request.session.set("userId", userId);
  reply.request.session.set("loginAt", Date.now());
}

export function clearSession(reply: FastifyReply) {
  reply.request.session.delete();
}

export interface AuthedContext {
  userId: string;
  dek: Buffer;
}

/** Returns userId from session or throws Unauthorized. */
export function requireUserId(req: FastifyRequest): string {
  const userId = req.session.get("userId");
  if (!userId) throw Unauthorized();
  return userId;
}

/** Returns full context with the DEK loaded from cache, or throws KeyUnavailable. */
export function requireAuth(req: FastifyRequest): AuthedContext {
  const userId = requireUserId(req);
  const dek = keyCache.get(userId);
  if (!dek) throw KeyUnavailable();
  return { userId, dek };
}
