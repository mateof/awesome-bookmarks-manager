import {
  CreateGroupBodySchema,
  CreateSharedBookmarkBodySchema,
  CreateSharedFolderBodySchema,
  DeleteSharedNodeBodySchema,
  EditSharedNodeBodySchema,
  MoveSharedNodeBodySchema,
  SetSharedAppearanceBodySchema,
  SetSharedFavoriteBodySchema,
  SetSharedTagsBodySchema,
  InviteMemberBodySchema,
  ShareToGroupBodySchema,
  ShareToGroupsBodySchema,
  UpdateGroupBodySchema,
} from "@awesome-bookmarks/shared";
import type { FastifyPluginAsync } from "fastify";
import { z } from "zod";
import { requireAuth } from "../auth/session.js";
import { readImageUpload } from "../storage/icons.js";
import { BadRequest } from "../util/errors.js";
import { deleteShareAssetFile, writeShareAsset } from "./assets.js";
import { detectImageContentType, imageNotModified } from "../util/image.js";
import {
  editSharedNode,
  readGroupShareAsset,
  readGroupShareContent,
} from "./content.js";
import { copyShareToHome, linkShareToHome } from "./import.js";
import {
  createSharedBookmark,
  createSharedFolder,
  deleteSharedNode,
  moveSharedNode,
  queueFieldEdit,
  setSharedAppearance,
  clearSharedAsset,
  setSharedAsset,
  setSharedFavorite,
  setSharedTags,
  shareAssetTarget,
} from "./ops.js";
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
  listSharesInMyGroups,
  rejectInvitation,
  removeMember,
  setMemberRole,
  shareToGroup,
  shareToGroups,
  updateGroup,
} from "./service.js";

const IdParam = z.object({ id: z.string().uuid() });
const GroupShareIdParam = z.object({ shareId: z.string().uuid() });
const NodeParams = z.object({
  shareId: z.string().uuid(),
  nodeId: z.string().uuid(),
});
const AssetParams = NodeParams.extend({
  kind: z.enum(["icon", "image"]),
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

  /**
   * Change somebody's level. No key rotation: every level from viewer up can
   * already decrypt, so moving between them changes what the server permits,
   * not what the key opens.
   */
  app.patch("/groups/:id/members/:userId/role", async (req) => {
    const ctx = requireAuth(req);
    const { id, userId } = GroupAndUserParams.parse(req.params);
    const { role } = z
      .object({ role: z.enum(["viewer", "editor", "admin", "super"]) })
      .parse(req.body);
    setMemberRole(ctx, id, userId, role);
    return { ok: true };
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

  /**
   * Share one thing with several groups in one call. See `shareToGroups`: the
   * first group's adoption re-seals the rows with its key, so doing the rest
   * from a client that has moved on would work against content it can no
   * longer read.
   */
  app.post("/shares/to-groups", async (req, reply) => {
    const ctx = requireAuth(req);
    const body = ShareToGroupsBodySchema.parse(req.body);
    reply.code(201);
    return shareToGroups(ctx, body.groupIds, {
      sourceType: body.sourceType,
      sourceId: body.sourceId,
    });
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

  // Import a shared item into my own library (root or a chosen folder).
  app.post("/shared/:shareId/import", async (req, reply) => {
    const ctx = requireAuth(req);
    const { shareId } = GroupShareIdParam.parse(req.params);
    const body = z
      .object({
        parentId: z.string().uuid().nullable().optional(),
        // "link" (default): a live portal to the share. "copy": a fully-owned
        // point-in-time snapshot with no shared badge.
        mode: z.enum(["link", "copy"]).optional(),
      })
      .parse(req.body ?? {});
    const item = listAllSharedWithMe(ctx).find((s) => s.id === shareId);
    if (!item) return { error: "not_found" };
    const { content } = readGroupShareContent(ctx, shareId);
    reply.code(201);
    const parentId = body.parentId ?? null;
    return body.mode === "copy"
      ? await copyShareToHome(ctx, content, parentId, shareId)
      : await linkShareToHome(
          ctx,
          content,
          parentId,
          item.groupName,
          shareId,
        );
  });

  app.get("/shared/:shareId", async (req) => {
    const ctx = requireAuth(req);
    const { shareId } = GroupShareIdParam.parse(req.params);
    // readGroupShareContent doesn't check membership, so re-check here. Any
    // group member may read the content, including the person who shared it
    // (that's the "shared by me" case), so use the unfiltered group list.
    if (!listSharesInMyGroups(ctx).find((s) => s.id === shareId)) {
      return { error: "not_found" };
    }
    return readGroupShareContent(ctx, shareId);
  });

  /**
   * Where a share's content actually lives.
   *
   * Sharing hands over the *same* row since key scopes, so a shared folder
   * opens on the ordinary folder page and there is nothing separate to render.
   * This says whether that is possible and which row to open.
   *
   * Deliberately its own endpoint rather than a new shape for the one above:
   * that one is read by the linked-folder portal and by drag-and-drop, which
   * want the payload tree and would break if it started answering something
   * else. Small and separate beats clever and shared.
   */
  app.get("/shared/:shareId/source", async (req) => {
    const ctx = requireAuth(req);
    const { shareId } = GroupShareIdParam.parse(req.params);
    const share = listSharesInMyGroups(ctx).find((s) => s.id === shareId);
    if (!share) return { error: "not_found" };
    return {
      type: share.sourceType,
      id: share.sourceId,
      reachable: share.sourceReachable,
    };
  });

  // A node's icon or background inside a share. The share keeps its own copy
  // sealed with the group key (the owner's blobs need the owner's key, and
  // they may be offline), so a member sees the folder as its owner designed it.
  app.get("/shared/:shareId/asset/:nodeId/:kind", async (req, reply) => {
    const ctx = requireAuth(req);
    const { shareId, nodeId, kind } = AssetParams.parse(req.params);
    if (!listSharesInMyGroups(ctx).find((s) => s.id === shareId)) {
      return reply.code(404).send({ error: "not_found" });
    }
    const version = (req.query as { v?: string } | undefined)?.v;
    if (version && imageNotModified(req, reply, version)) return;
    const bytes = await readGroupShareAsset(ctx, shareId, nodeId, kind);
    if (!bytes) return reply.code(404).send({ error: "not_found" });
    return reply.type(detectImageContentType(bytes)).send(bytes);
  });

  // Edit a node inside an editable ("editor") share. Membership re-checked
  // here; editSharedNode enforces the editor access level.
  app.patch("/shared/:shareId/node/:nodeId", async (req) => {
    const ctx = requireAuth(req);
    const { shareId, nodeId } = NodeParams.parse(req.params);
    const body = EditSharedNodeBodySchema.parse(req.body);
    if (!listSharesInMyGroups(ctx).find((s) => s.id === shareId)) {
      return { error: "not_found" };
    }
    const out = editSharedNode(ctx, shareId, nodeId, body);
    // The payload now has the edit; this is what eventually carries it into
    // the owner's own folder instead of leaving the two to drift apart.
    queueFieldEdit(ctx, shareId, nodeId, body);
    return out;
  });

  /* --- Structural editing inside an editor share. The change lands in the
     shared payload at once and is replayed into the owner's real rows when
     they are next online; see groups/ops.ts. --- */

  app.post("/shared/:shareId/folders", async (req, reply) => {
    const ctx = requireAuth(req);
    const { shareId } = GroupShareIdParam.parse(req.params);
    const body = CreateSharedFolderBodySchema.parse(req.body);
    if (!listSharesInMyGroups(ctx).find((s) => s.id === shareId)) {
      return reply.code(404).send({ error: "not_found" });
    }
    reply.code(201);
    return createSharedFolder(ctx, shareId, body);
  });

  app.post("/shared/:shareId/bookmarks", async (req, reply) => {
    const ctx = requireAuth(req);
    const { shareId } = GroupShareIdParam.parse(req.params);
    const body = CreateSharedBookmarkBodySchema.parse(req.body);
    if (!listSharesInMyGroups(ctx).find((s) => s.id === shareId)) {
      return reply.code(404).send({ error: "not_found" });
    }
    reply.code(201);
    return createSharedBookmark(ctx, shareId, body);
  });

  app.post("/shared/:shareId/node/:nodeId/move", async (req, reply) => {
    const ctx = requireAuth(req);
    const { shareId, nodeId } = NodeParams.parse(req.params);
    const body = MoveSharedNodeBodySchema.parse(req.body);
    if (!listSharesInMyGroups(ctx).find((s) => s.id === shareId)) {
      return reply.code(404).send({ error: "not_found" });
    }
    return moveSharedNode(
      ctx,
      shareId,
      nodeId,
      body.folderId,
      body.position,
      body.baseRev,
    );
  });

  app.put("/shared/:shareId/node/:nodeId/tags", async (req, reply) => {
    const ctx = requireAuth(req);
    const { shareId, nodeId } = NodeParams.parse(req.params);
    const body = SetSharedTagsBodySchema.parse(req.body);
    if (!listSharesInMyGroups(ctx).find((s) => s.id === shareId)) {
      return reply.code(404).send({ error: "not_found" });
    }
    return setSharedTags(ctx, shareId, nodeId, body.tags, body.baseRev);
  });

  app.put("/shared/:shareId/node/:nodeId/appearance", async (req, reply) => {
    const ctx = requireAuth(req);
    const { shareId, nodeId } = NodeParams.parse(req.params);
    const body = SetSharedAppearanceBodySchema.parse(req.body);
    if (!listSharesInMyGroups(ctx).find((s) => s.id === shareId)) {
      return reply.code(404).send({ error: "not_found" });
    }
    return setSharedAppearance(ctx, shareId, nodeId, body);
  });

  app.put("/shared/:shareId/node/:nodeId/favorite", async (req, reply) => {
    const ctx = requireAuth(req);
    const { shareId, nodeId } = NodeParams.parse(req.params);
    const body = SetSharedFavoriteBodySchema.parse(req.body);
    if (!listSharesInMyGroups(ctx).find((s) => s.id === shareId)) {
      return reply.code(404).send({ error: "not_found" });
    }
    return setSharedFavorite(ctx, shareId, nodeId, body.favorite, body.baseRev);
  });

  // A member replacing a node's icon or background. The bytes go into the
  // share's own asset store sealed with the group key, so the group sees them
  // at once; the write-back re-seals them under the owner's key later.
  app.post("/shared/:shareId/node/:nodeId/asset/:kind", async (req, reply) => {
    const ctx = requireAuth(req);
    const { shareId, nodeId, kind } = AssetParams.parse(req.params);
    if (!listSharesInMyGroups(ctx).find((s) => s.id === shareId)) {
      return reply.code(404).send({ error: "not_found" });
    }
    if (!req.isMultipart()) throw BadRequest("multipart/form-data expected");
    const file = await req.file();
    if (!file) throw BadRequest("file part missing");
    const target = shareAssetTarget(ctx, shareId);
    const bytes = await readImageUpload(file, kind === "image");
    await writeShareAsset(
      target.ownerUserId,
      shareId,
      nodeId,
      kind,
      target.groupId,
      target.groupDek,
      bytes,
    );
    // The version doubles as the cache-busting token, so a replacement is
    // picked up instead of the browser showing the old one.
    return setSharedAsset(
      ctx,
      shareId,
      nodeId,
      kind,
      new Date().toISOString(),
    );
  });

  // Clear a node's background image (parity with the personal flow, where a
  // background can be removed but an icon cannot).
  app.delete("/shared/:shareId/node/:nodeId/asset/image", async (req, reply) => {
    const ctx = requireAuth(req);
    const { shareId, nodeId } = NodeParams.parse(req.params);
    if (!listSharesInMyGroups(ctx).find((s) => s.id === shareId)) {
      return reply.code(404).send({ error: "not_found" });
    }
    const target = shareAssetTarget(ctx, shareId);
    await deleteShareAssetFile(target.ownerUserId, shareId, nodeId, "image");
    return clearSharedAsset(ctx, shareId, nodeId);
  });

  app.delete("/shared/:shareId/node/:nodeId", async (req, reply) => {
    const ctx = requireAuth(req);
    const { shareId, nodeId } = NodeParams.parse(req.params);
    const body = DeleteSharedNodeBodySchema.parse(req.body ?? {});
    if (!listSharesInMyGroups(ctx).find((s) => s.id === shareId)) {
      return reply.code(404).send({ error: "not_found" });
    }
    return deleteSharedNode(ctx, shareId, nodeId, body.baseRev);
  });
};
