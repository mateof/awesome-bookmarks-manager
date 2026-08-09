import {
  ChangePasswordBodySchema,
  FirstPasswordBodySchema,
  LoginBodySchema,
  SignupBodySchema,
  TotpCodeSchema,
  UpdateProfileBodySchema,
} from "@awesome-bookmarks/shared";
import type { FastifyPluginAsync } from "fastify";
import { getRegistrationEnabled } from "../settings/service.js";
import {
  changePassword,
  getMe,
  login as loginService,
  setAutoAcceptInvitations,
  setAutoSnapshots,
  setFirstPassword,
  setNickname,
  signup as signupService,
} from "./service.js";
import {
  clearSession,
  requireAuth,
  requireUserId,
  setSession,
} from "./session.js";
import { isTrustedNetwork } from "./trusted.js";
import {
  beginTwoFactorSetup,
  disableTwoFactor,
  enableTwoFactor,
} from "./twofa.js";

export const authRoutes: FastifyPluginAsync = async (app) => {
  // Public: lets the login/signup page know whether signup is open.
  app.get("/auth/config", async () => ({
    registrationEnabled: getRegistrationEnabled(),
  }));

  app.post("/auth/signup", async (req, reply) => {
    const body = SignupBodySchema.parse(req.body);
    const user = await signupService(body.email, body.password, body.nickname);
    setSession(reply, user.id);
    return user;
  });

  app.post("/auth/login", async (req, reply) => {
    const body = LoginBodySchema.parse(req.body);
    const result = await loginService(body.identifier, body.password, {
      totp: body.totp,
      trusted: isTrustedNetwork(req),
    });
    if (!result.ok) return { twoFactorRequired: true };
    setSession(reply, result.user.id);
    return result.user;
  });

  // TOTP two-factor. Setup returns the secret + otpauth URI for the QR;
  // enable/disable require a valid 6-digit code from the authenticator.
  app.post("/2fa/setup", async (req) => {
    const ctx = requireAuth(req);
    return beginTwoFactorSetup(ctx);
  });

  app.post("/2fa/enable", async (req) => {
    const ctx = requireAuth(req);
    const { code } = TotpCodeSchema.parse(req.body);
    enableTwoFactor(ctx, code);
    return { ok: true };
  });

  app.post("/2fa/disable", async (req) => {
    const ctx = requireAuth(req);
    const { code } = TotpCodeSchema.parse(req.body);
    disableTwoFactor(ctx, code);
    return { ok: true };
  });

  app.post("/auth/logout", async (_req, reply) => {
    clearSession(reply);
    return { ok: true };
  });

  app.post("/auth/change-password", async (req) => {
    const ctx = requireAuth(req); // ensures DEK is unlockable from current pw
    const body = ChangePasswordBodySchema.parse(req.body);
    await changePassword(ctx.userId, body.currentPassword, body.newPassword);
    return { ok: true };
  });

  // First-login password set (admin-provisioned accounts). The one-time
  // password was already used to log in, so we re-key from the cached DEK.
  app.post("/auth/first-password", async (req) => {
    const ctx = requireAuth(req);
    const body = FirstPasswordBodySchema.parse(req.body);
    await setFirstPassword(ctx.userId, body.newPassword);
    return { ok: true };
  });

  app.patch("/me", async (req) => {
    const userId = requireUserId(req);
    const body = UpdateProfileBodySchema.parse(req.body);
    if (body.nickname !== undefined) setNickname(userId, body.nickname);
    if (body.autoSnapshots !== undefined)
      setAutoSnapshots(userId, body.autoSnapshots);
    if (body.autoAcceptInvitations !== undefined)
      setAutoAcceptInvitations(userId, body.autoAcceptInvitations);
    return getMe(userId);
  });

  app.get("/me", async (req) => {
    const userId = requireUserId(req);
    return getMe(userId);
  });
};
