import {
  ChangePasswordBodySchema,
  FirstPasswordBodySchema,
  LoginBodySchema,
  SignupBodySchema,
  TotpCodeSchema,
  UpdateProfileBodySchema,
} from "@awesome-bookmarks/shared";
import type { FastifyPluginAsync } from "fastify";
import { z } from "zod";
import { recordEvent } from "../security-log/service.js";
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
  currentSessionId,
  requireAuth,
  requireUserId,
  setSession,
} from "./session.js";
import {
  listSessions,
  revokeOtherSessions,
  revokeSession,
} from "./sessions-service.js";
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
    recordEvent({ type: "signup", req, userId: user.id, subject: user.email });
    return user;
  });

  app.post("/auth/login", async (req, reply) => {
    const body = LoginBodySchema.parse(req.body);
    let result;
    try {
      result = await loginService(body.identifier, body.password, {
        totp: body.totp,
        trusted: isTrustedNetwork(req),
      });
    } catch (err) {
      // Records what was *attempted*, which is the whole point: a run of these
      // against one account from one IP is what an attack looks like.
      recordEvent({
        type: "login_failed",
        req,
        subject: body.identifier,
        status: 401,
      });
      throw err;
    }
    if (!result.ok) {
      recordEvent({ type: "login_2fa_required", req, subject: body.identifier });
      return { twoFactorRequired: true };
    }
    setSession(reply, result.user.id);
    recordEvent({
      type: "login_ok",
      req,
      userId: result.user.id,
      subject: result.user.email,
    });
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
    recordEvent({ type: "twofa_enabled", req, userId: ctx.userId });
    return { ok: true };
  });

  app.post("/2fa/disable", async (req) => {
    const ctx = requireAuth(req);
    const { code } = TotpCodeSchema.parse(req.body);
    disableTwoFactor(ctx, code);
    recordEvent({ type: "twofa_disabled", req, userId: ctx.userId });
    return { ok: true };
  });

  app.post("/auth/logout", async (req, reply) => {
    const userId = req.session.get("userId");
    clearSession(reply);
    recordEvent({ type: "logout", req, userId: userId ?? null });
    return { ok: true };
  });

  // --- active logins -------------------------------------------------
  app.get("/sessions", async (req) => {
    const userId = requireUserId(req);
    return listSessions(userId, currentSessionId(req));
  });

  app.delete("/sessions/:id", async (req, reply) => {
    const userId = requireUserId(req);
    const { id } = z.object({ id: z.string().uuid() }).parse(req.params);
    revokeSession(userId, id);
    recordEvent({ type: "session_revoked", req, userId, detail: id });
    // Revoking your own session is a logout; drop the cookie so the client
    // does not keep sending one that will be refused from here on.
    if (id === currentSessionId(req)) reply.request.session.delete();
    reply.code(204);
  });

  app.delete("/sessions", async (req) => {
    const userId = requireUserId(req);
    const current = currentSessionId(req);
    if (!current) return { revoked: 0 };
    return { revoked: revokeOtherSessions(userId, current) };
  });

  app.post("/auth/change-password", async (req) => {
    const ctx = requireAuth(req); // ensures DEK is unlockable from current pw
    const body = ChangePasswordBodySchema.parse(req.body);
    await changePassword(ctx.userId, body.currentPassword, body.newPassword);
    recordEvent({ type: "password_changed", req, userId: ctx.userId });
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
