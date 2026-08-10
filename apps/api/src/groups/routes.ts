import {
  CreateGroupBodySchema,
  EditSharedNodeBodySchema,
  InviteMemberBodySchema,
  ShareToGroupBodySchema,
  UpdateGroupBodySchema,
} from "@awesome-bookmarks/shared";
import type { FastifyPluginAsync } from "fastify";
import { z } from "zod";
import { requireAuth } from "../auth/session.js";
import { editSharedNode, readGroupShareContent } from "./content.js";
import { importShareToHome } from "./import.js";
import {
  acceptInvitation,
  cancelInvitation,
  createGroup,
  deleteGroup,
  deleteShare,
  getGroup,
  inviteMember,
  leaveGroup,
  listAllSharedWithMe,
  listGroupInvitations,
  listGroupShares,
  listMembers,
  listMyGroups,
  listMyInvitations,
  listMySharesByMe,
  rejectInvitation,
  removeMember,
  shareToGroup,
  updateGroup,
} from "./service.js";

const IdParam = z.object({ id: z.string().uuid() });
const GroupShareIdParam = z.object({ shareId: z.string().uuid() });
const NodeParams = z.object({
  shareId: z.string().uuid(),
  nodeId: z.string().uuid(),
});
const GroupAndUserParams = z.object({
  id: z.string().uuid(),
  userId: z.string().uuid(),
});
const TokenParam = z.object({ token: z.string().min(1).max(256) });
const GroupAndInviteParams = z.object({
  id: z.string().uuid(),
  invId: z.string().uuid(),
});

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

  app.post("/invitations/:token/reject", async (req) => {
    const ctx = requireAuth(req);
    const { token } = TokenParam.parse(req.params);
    return rejectInvitation(ctx, token);
  });

  // Invitations the sender created for a group, with status; and cancelling
  // an unused one.
  app.get("/groups/:id/invitations", async (req) => {
    const ctx = requireAuth(req);
    const { id } = IdParam.parse(req.params);
    return listGroupInvitations(ctx, id);
  });

  app.delete("/groups/:id/invitations/:invId", async (req, reply) => {
    const ctx = requireAuth(req);
    const { id, invId } = GroupAndInviteParams.parse(req.params);
    cancelInvitation(ctx, id, invId);
    reply.code(204);
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

  // Everything I have shared into my groups (central manage view).
  app.get("/shared/by-me", async (req) => {
    const ctx = requireAuth(req);
    return listMySharesByMe(ctx);
  });

  // Import a shared item into my own home as owned folders/bookmarks.
  app.post("/shared/:shareId/import", async (req, reply) => {
    const ctx = requireAuth(req);
    const { shareId } = GroupShareIdParam.parse(req.params);
    const item = listAllSharedWithMe(ctx).find((s) => s.id === shareId);
    if (!item) return { error: "not_found" };
    const { content } = readGroupShareContent(ctx, shareId);
    reply.code(201);
    return importShareToHome(ctx, content, null, item.groupName);
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

  // Edit a node inside an editable ("editor") share. Membership re-checked
  // here; editSharedNode enforces the editor access level.
  app.patch("/shared/:shareId/node/:nodeId", async (req) => {
    const ctx = requireAuth(req);
    const { shareId, nodeId } = NodeParams.parse(req.params);
    const body = EditSharedNodeBodySchema.parse(req.body);
    const all = listAllSharedWithMe(ctx);
    if (!all.find((s) => s.id === shareId)) {
      return { error: "not_found" };
    }
    return editSharedNode(ctx, shareId, nodeId, body);
  });
};
