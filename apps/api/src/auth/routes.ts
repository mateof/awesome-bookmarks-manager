import {
  ChangePasswordBodySchema,
  LoginBodySchema,
  SignupBodySchema,
  UpdateProfileBodySchema,
} from "@awesome-bookmarks/shared";
import type { FastifyPluginAsync } from "fastify";
import {
  changePassword,
  getMe,
  login as loginService,
  setAutoSnapshots,
  setNickname,
  signup as signupService,
} from "./service.js";
import {
  clearSession,
  requireAuth,
  requireUserId,
  setSession,
} from "./session.js";

export const authRoutes: FastifyPluginAsync = async (app) => {
  app.post("/auth/signup", async (req, reply) => {
    const body = SignupBodySchema.parse(req.body);
    const user = await signupService(body.email, body.password, body.nickname);
    setSession(reply, user.id);
    return user;
  });

  app.post("/auth/login", async (req, reply) => {
    const body = LoginBodySchema.parse(req.body);
    const user = await loginService(body.identifier, body.password);
    setSession(reply, user.id);
    return user;
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

  app.patch("/me", async (req) => {
    const userId = requireUserId(req);
    const body = UpdateProfileBodySchema.parse(req.body);
    if (body.nickname !== undefined) setNickname(userId, body.nickname);
    if (body.autoSnapshots !== undefined)
      setAutoSnapshots(userId, body.autoSnapshots);
    return getMe(userId);
  });

  app.get("/me", async (req) => {
    const userId = requireUserId(req);
    return getMe(userId);
  });
};
