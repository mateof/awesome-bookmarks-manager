import {
  CreateColumnBodySchema,
  CreateDatabaseBodySchema,
  CreateRowBodySchema,
  CreateViewBodySchema,
  UpdateColumnBodySchema,
  UpdateDatabaseBodySchema,
  UpdateRowBodySchema,
  UpdateViewBodySchema,
} from "@awesome-bookmarks/shared";
import type { FastifyPluginAsync } from "fastify";
import { z } from "zod";
import { requireAuth } from "../auth/session.js";
import { adoptDatabaseIntoGroup } from "../groups/adopt.js";
import { requireRole } from "../groups/roles.js";
import {
  addColumn,
  addRow,
  addView,
  createDatabase,
  deleteColumn,
  deleteDatabase,
  deleteRow,
  deleteView,
  getDatabase,
  listDatabases,
  listRowVersions,
  renameDatabase,
  reorderColumns,
  reorderRows,
  restoreRowVersion,
  updateColumn,
  updateRow,
  updateView,
} from "./service.js";

const IdParam = z.object({ id: z.string().uuid() });
const ChildParam = z.object({
  id: z.string().uuid(),
  childId: z.string().uuid(),
});

export const databaseRoutes: FastifyPluginAsync = async (app) => {
  app.get("/databases", async (req) => listDatabases(requireAuth(req)));

  app.post("/databases", async (req, reply) => {
    const ctx = requireAuth(req);
    const { name } = CreateDatabaseBodySchema.parse(req.body ?? {});
    reply.code(201);
    return createDatabase(ctx, name);
  });

  app.get("/databases/:id", async (req) => {
    const ctx = requireAuth(req);
    // `block` identifies the embed asking, so it can be handed its own private
    // views along with the database's shared ones.
    const { block } = z
      .object({ block: z.string().max(64).optional() })
      .parse(req.query ?? {});
    return getDatabase(ctx, IdParam.parse(req.params).id, block);
  });

  app.patch("/databases/:id", async (req) => {
    const ctx = requireAuth(req);
    const { name } = UpdateDatabaseBodySchema.parse(req.body);
    return renameDatabase(ctx, IdParam.parse(req.params).id, name);
  });

  app.delete("/databases/:id", async (req, reply) => {
    const ctx = requireAuth(req);
    deleteDatabase(ctx, IdParam.parse(req.params).id);
    reply.code(204);
  });

  /**
   * Share a database with a group, on its own.
   *
   * Separate from sharing a folder because a database is its own entity: the
   * same table can be embedded in several folders and bookmarks, and those are
   * not necessarily shared with the same people. Sharing the table is what
   * gives the group access to it, not sharing a note that happens to mention
   * it.
   */
  app.post("/databases/:id/share", async (req) => {
    const ctx = requireAuth(req);
    const { id } = IdParam.parse(req.params);
    const { groupId } = z
      .object({ groupId: z.string().uuid() })
      .parse(req.body);
    // Membership is what entitles you to hand something to a group; the role
    // check for *writing* the table happens on every write afterwards.
    requireRole(ctx, groupId, "editor");
    const moved = adoptDatabaseIntoGroup(ctx, id, groupId);
    return { shared: moved, groupId };
  });

  // --- columns -------------------------------------------------------------

  app.post("/databases/:id/columns", async (req, reply) => {
    const ctx = requireAuth(req);
    reply.code(201);
    return addColumn(
      ctx,
      IdParam.parse(req.params).id,
      CreateColumnBodySchema.parse(req.body),
    );
  });

  app.patch("/databases/:id/columns/:childId", async (req) => {
    const ctx = requireAuth(req);
    const { id, childId } = ChildParam.parse(req.params);
    return updateColumn(ctx, id, childId, UpdateColumnBodySchema.parse(req.body));
  });

  app.delete("/databases/:id/columns/:childId", async (req, reply) => {
    const ctx = requireAuth(req);
    const { id, childId } = ChildParam.parse(req.params);
    deleteColumn(ctx, id, childId);
    reply.code(204);
  });

  app.post("/databases/:id/columns/reorder", async (req) => {
    const ctx = requireAuth(req);
    const { order } = z
      .object({ order: z.array(z.string().uuid()).max(200) })
      .parse(req.body);
    reorderColumns(ctx, IdParam.parse(req.params).id, order);
    return { ok: true };
  });

  // --- rows ----------------------------------------------------------------

  app.post("/databases/:id/rows", async (req, reply) => {
    const ctx = requireAuth(req);
    reply.code(201);
    return addRow(
      ctx,
      IdParam.parse(req.params).id,
      CreateRowBodySchema.parse(req.body ?? {}),
    );
  });

  app.patch("/databases/:id/rows/:childId", async (req) => {
    const ctx = requireAuth(req);
    const { id, childId } = ChildParam.parse(req.params);
    return updateRow(ctx, id, childId, UpdateRowBodySchema.parse(req.body));
  });

  app.delete("/databases/:id/rows/:childId", async (req, reply) => {
    const ctx = requireAuth(req);
    const { id, childId } = ChildParam.parse(req.params);
    deleteRow(ctx, id, childId);
    reply.code(204);
  });

  app.get("/databases/:id/rows/:childId/versions", async (req) => {
    const ctx = requireAuth(req);
    const { id, childId } = ChildParam.parse(req.params);
    return listRowVersions(ctx, id, childId);
  });

  app.post(
    "/databases/:id/rows/:childId/versions/:versionId/restore",
    async (req) => {
      const ctx = requireAuth(req);
      const { id, childId, versionId } = ChildParam.extend({
        versionId: z.string().uuid(),
      }).parse(req.params);
      return restoreRowVersion(ctx, id, childId, versionId);
    },
  );

  app.post("/databases/:id/rows/reorder", async (req) => {
    const ctx = requireAuth(req);
    const { order } = z
      .object({ order: z.array(z.string().uuid()).max(5000) })
      .parse(req.body);
    reorderRows(ctx, IdParam.parse(req.params).id, order);
    return { ok: true };
  });

  // --- views ---------------------------------------------------------------

  app.post("/databases/:id/views", async (req, reply) => {
    const ctx = requireAuth(req);
    reply.code(201);
    return addView(
      ctx,
      IdParam.parse(req.params).id,
      CreateViewBodySchema.parse(req.body),
    );
  });

  app.patch("/databases/:id/views/:childId", async (req) => {
    const ctx = requireAuth(req);
    const { id, childId } = ChildParam.parse(req.params);
    return updateView(ctx, id, childId, UpdateViewBodySchema.parse(req.body));
  });

  app.delete("/databases/:id/views/:childId", async (req, reply) => {
    const ctx = requireAuth(req);
    const { id, childId } = ChildParam.parse(req.params);
    deleteView(ctx, id, childId);
    reply.code(204);
  });
};
