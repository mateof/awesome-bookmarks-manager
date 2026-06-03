import {
  CreateGroupBodySchema,
  InviteMemberBodySchema,
  ShareToGroupBodySchema,
  UpdateGroupBodySchema,
} from "@awesome-bookmarks/shared";
import type { FastifyPluginAsync } from "fastify";
import { z } from "zod";
import { requireAuth } from "../auth/session.js";
import { readGroupShareContent } from "./content.js";
import {
  acceptInvitation,
  createGroup,
  deleteGroup,
  deleteShare,
  getGroup,
  inviteMember,
  leaveGroup,
  listAllSharedWithMe,
  listGroupShares,
  listMembers,
  listMyGroups,
  listMyInvitations,
  removeMember,
  shareToGroup,
  updateGroup,
} from "./service.js";

const IdParam = z.object({ id: z.string().uuid() });
const GroupShareIdParam = z.object({ shareId: z.string().uuid() });
const GroupAndUserParams = z.object({
  id: z.string().uuid(),
  userId: z.string().uuid(),
});
const TokenParam = z.object({ token: z.string().min(1).max(256) });

export const groupRoutes: FastifyPluginAsync = async (app) => {
  app.get("/groups", async (req) => {
    const ctx = requireAuth(req);
    return listMyGroups(ctx);
  });

  app.post("/groups", async (req, reply) => {
    const ctx = requireAuth(req);
    const body = CreateGroupBodySchema.parse(req.body);
    const g = createGroup(ctx, body);
    reply.code(201);
    return g;
  });

  app.get("/groups/:id", async (req) => {
    const ctx = requireAuth(req);
    const { id } = IdParam.parse(req.params);
    return getGroup(ctx, id);
  });

  app.patch("/groups/:id", async (req) => {
    const ctx = requireAuth(req);
    const { id } = IdParam.parse(req.params);
    const body = UpdateGroupBodySchema.parse(req.body);
    updateGroup(ctx, id, body);
    return { ok: true };
  });

  app.delete("/groups/:id", async (req, reply) => {
    const ctx = requireAuth(req);
    const { id } = IdParam.parse(req.params);
    deleteGroup(ctx, id);
    reply.code(204);
  });

  app.get("/groups/:id/members", async (req) => {
    const ctx = requireAuth(req);
    const { id } = IdParam.parse(req.params);
    return listMembers(ctx, id);
  });

  app.delete("/groups/:id/members/:userId", async (req, reply) => {
    const ctx = requireAuth(req);
    const { id, userId } = GroupAndUserParams.parse(req.params);
    removeMember(ctx, id, userId);
    reply.code(204);
  });

  app.post("/groups/:id/leave", async (req) => {
    const ctx = requireAuth(req);
    const { id } = IdParam.parse(req.params);
    leaveGroup(ctx, id);
    return { ok: true };
  });

  app.post("/groups/:id/invitations", async (req, reply) => {
    const ctx = requireAuth(req);
    const { id } = IdParam.parse(req.params);
    const body = InviteMemberBodySchema.parse(req.body);
    const inv = inviteMember(ctx, id, body);
    reply.code(201);
    return inv;
  });

  app.get("/invitations", async (req) => {
    const ctx = requireAuth(req);
    return listMyInvitations(ctx);
  });

  app.post("/invitations/:token/accept", async (req) => {
    const ctx = requireAuth(req);
    const { token } = TokenParam.parse(req.params);
    return acceptInvitation(ctx, token);
  });

  // Group shares
  app.get("/groups/:id/shares", async (req) => {
    const ctx = requireAuth(req);
    const { id } = IdParam.parse(req.params);
    return listGroupShares(ctx, id);
  });

  app.post("/groups/:id/shares", async (req, reply) => {
    const ctx = requireAuth(req);
    const { id } = IdParam.parse(req.params);
    const body = ShareToGroupBodySchema.parse(req.body);
    const out = shareToGroup(ctx, id, body);
    reply.code(202);
    return out;
  });

  app.delete("/groups/:id/shares/:shareId", async (req, reply) => {
    const ctx = requireAuth(req);
    const { shareId } = GroupShareIdParam.parse(req.params);
    deleteShare(ctx, shareId);
    reply.code(204);
  });

  // "All things shared with me" — single endpoint for the sidebar Shared section
  app.get("/shared", async (req) => {
    const ctx = requireAuth(req);
    return listAllSharedWithMe(ctx);
  });

  app.get("/shared/:shareId", async (req) => {
    const ctx = requireAuth(req);
    const { shareId } = GroupShareIdParam.parse(req.params);
    // listAllSharedWithMe already filters to my groups; readGroupShareContent
    // doesn't check membership, so we re-check here.
    const all = listAllSharedWithMe(ctx);
    if (!all.find((s) => s.id === shareId)) {
      // Could be that the share exists but I'm not a member of the group
      return { error: "not_found" };
    }
    return readGroupShareContent(ctx, shareId);
  });
};
