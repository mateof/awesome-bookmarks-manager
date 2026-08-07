import type { FastifyInstance, FastifyReply, FastifyRequest } from "fastify";
import { hkdf } from "@awesome-bookmarks/crypto";
import secureSession from "@fastify/secure-session";
import { getEnv } from "../env.js";
import { masterUnwrap, masterWrap } from "./encryption.js";
import { keyCache } from "./key-cache.js";
import { KeyUnavailable, Unauthorized } from "../util/errors.js";

declare module "@fastify/secure-session" {
  interface SessionData {
    userId: string;
    loginAt: number;
    // Master-wrapped DEK (base64), only present when PERSIST_SESSION_KEY is on.
    // Lets a request rehydrate the in-memory key cache after a restart without
    // asking for the password again.
    dekWrap: string;
    // In-flight WebAuthn challenge (base64url) for a register/login ceremony.
    waChallenge: string;
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
  // Login/signup have just populated the key cache; stash the wrapped DEK in
  // the (already server-encrypted) cookie so restarts don't force a re-login.
  if (getEnv().PERSIST_SESSION_KEY) {
    const dek = keyCache.get(userId);
    if (dek) {
      reply.request.session.set(
        "dekWrap",
        masterWrap(userId, dek).toString("base64"),
      );
    }
  }
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
  let dek = keyCache.get(userId);
  if (!dek) dek = rehydrateFromSession(req, userId);
  if (!dek) throw KeyUnavailable();
  return { userId, dek };
}

/**
 * After a restart the in-memory key cache is empty. If PERSIST_SESSION_KEY is
 * enabled and the cookie carries a master-wrapped DEK, unwrap it, refill the
 * cache, and continue without a password prompt. Returns undefined otherwise.
 */
function rehydrateFromSession(
  req: FastifyRequest,
  userId: string,
): Buffer | undefined {
  if (!getEnv().PERSIST_SESSION_KEY) return undefined;
  const wrap = req.session.get("dekWrap");
  if (!wrap) return undefined;
  try {
    const dek = masterUnwrap(userId, Buffer.from(wrap, "base64"));
    keyCache.put(userId, dek);
    return dek;
  } catch {
    // Wrong MASTER_KEY / tampered cookie: fall back to a normal re-login.
    return undefined;
  }
}
