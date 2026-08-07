import type { FastifyPluginAsync } from "fastify";
import { z } from "zod";
import { keyCache } from "../auth/key-cache.js";
import { getMe } from "../auth/service.js";
import { requireAuth, requireUserId, setSession } from "../auth/session.js";
import { webauthnConfig } from "./config.js";
import {
  deleteCredential,
  genAuthenticationOptions,
  genRegistrationOptions,
  listCredentials,
  verifyAuthentication,
  verifyRegistration,
} from "./service.js";

const IdParam = z.object({ id: z.string().uuid() });
// The WebAuthn response objects are large and validated by @simplewebauthn
// itself, so we accept them loosely here.
const RegisterVerifyBody = z.object({
  response: z.any(),
  prfSecret: z.string(),
  label: z.string().max(64).optional(),
});
const LoginVerifyBody = z.object({
  response: z.any(),
  prfSecret: z.string(),
});

export const webauthnRoutes: FastifyPluginAsync = async (app) => {
  // Public: lets the SPA show/hide the passkey UI.
  app.get("/webauthn/config", async () => {
    const c = webauthnConfig();
    return {
      enabled: !!c,
      rpId: c?.rpID ?? null,
      allowPrfless: c?.allowPrfless ?? false,
    };
  });

  app.post("/webauthn/register/options", async (req) => {
    const ctx = requireAuth(req);
    const options = await genRegistrationOptions(ctx);
    req.session.set("waChallenge", options.challenge);
    return options;
  });

  app.post("/webauthn/register/verify", async (req) => {
    const ctx = requireAuth(req);
    const body = RegisterVerifyBody.parse(req.body);
    const result = await verifyRegistration(ctx, {
      response: body.response,
      prfSecret: body.prfSecret,
      label: body.label,
      expectedChallenge: req.session.get("waChallenge"),
    });
    req.session.set("waChallenge", undefined as unknown as string);
    return result;
  });

  app.post("/webauthn/login/options", async (req) => {
    const options = await genAuthenticationOptions();
    req.session.set("waChallenge", options.challenge);
    return options;
  });

  app.post("/webauthn/login/verify", async (req, reply) => {
    const body = LoginVerifyBody.parse(req.body);
    const { userId, dek } = await verifyAuthentication({
      response: body.response,
      prfSecret: body.prfSecret,
      expectedChallenge: req.session.get("waChallenge"),
    });
    req.session.set("waChallenge", undefined as unknown as string);
    // A passkey is strong (possession + user verification), so it stands in
    // for both factors: load the DEK and open the session directly.
    keyCache.put(userId, dek);
    setSession(reply, userId);
    return getMe(userId);
  });

  app.get("/webauthn/credentials", async (req) => {
    const userId = requireUserId(req);
    return listCredentials(userId);
  });

  app.delete("/webauthn/credentials/:id", async (req, reply) => {
    const ctx = requireAuth(req);
    const { id } = IdParam.parse(req.params);
    deleteCredential(ctx, id);
    reply.code(204);
  });
};
