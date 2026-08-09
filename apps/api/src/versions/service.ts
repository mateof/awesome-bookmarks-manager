import { and, desc, eq, inArray } from "drizzle-orm";
import { v4 as uuidv4 } from "uuid";
import { openField, sealField } from "../auth/encryption.js";
import type { AuthedContext } from "../auth/session.js";
import { getDb } from "../db/client.js";
import { entityVersions } from "../db/schema.js";
import { NotFound } from "../util/errors.js";

export type EntityType = "folder" | "bookmark";

export interface FolderSnapshot {
  name: string;
  description: string | null;
  bgColor: string | null;
  tagIds: string[];
}
export interface BookmarkSnapshot {
  title: string;
  url: string;
  description: string | null;
  bgColor: string | null;
  folderId: string | null;
  tagIds: string[];
}
export type Snapshot = FolderSnapshot | BookmarkSnapshot;

export interface VersionMeta {
  id: string;
  entityType: EntityType;
  entityId: string;
  rev: number;
  actorId: string;
  createdAt: string;
}
export interface VersionDetail extends VersionMeta {
  snapshot: Snapshot;
}
export interface ActivityEntry extends VersionMeta {
  label: string;
}

/** Seal + store a snapshot of an entity's editable fields at a given rev. */
export function recordVersion(
  ctx: AuthedContext,
  entityType: EntityType,
  entityId: string,
  rev: number,
  snapshot: Snapshot,
): void {
  getDb()
    .insert(entityVersions)
    .values({
      id: uuidv4(),
      userId: ctx.userId,
      entityType,
      entityId,
      rev,
      actorId: ctx.userId,
      payloadCt: sealField(
        ctx.dek,
        ctx.userId,
        "version.payload",
        JSON.stringify(snapshot),
      ),
    })
    .run();
}

export function listVersions(
  ctx: AuthedContext,
  entityType: EntityType,
  entityId: string,
): VersionMeta[] {
  return getDb()
    .select({
      id: entityVersions.id,
      entityType: entityVersions.entityType,
      entityId: entityVersions.entityId,
      rev: entityVersions.rev,
      actorId: entityVersions.actorId,
      createdAt: entityVersions.createdAt,
    })
    .from(entityVersions)
    .where(
      and(
        eq(entityVersions.userId, ctx.userId),
        eq(entityVersions.entityType, entityType),
        eq(entityVersions.entityId, entityId),
      ),
    )
    .orderBy(desc(entityVersions.createdAt))
    .all() as VersionMeta[];
}

export function getVersion(
  ctx: AuthedContext,
  versionId: string,
): VersionDetail {
  const row = getDb()
    .select()
    .from(entityVersions)
    .where(
      and(
        eq(entityVersions.id, versionId),
        eq(entityVersions.userId, ctx.userId),
      ),
    )
    .get();
  if (!row) throw NotFound("Version not found");
  const snapshot = JSON.parse(
    openField(ctx.dek, ctx.userId, "version.payload", Buffer.from(row.payloadCt)),
  ) as Snapshot;
  return {
    id: row.id,
    entityType: row.entityType as EntityType,
    entityId: row.entityId,
    rev: row.rev,
    actorId: row.actorId,
    createdAt: row.createdAt,
    snapshot,
  };
}

/** Recent version events across a set of entity ids (a folder subtree). */
export function listActivity(
  ctx: AuthedContext,
  entityIds: string[],
  limit = 200,
): ActivityEntry[] {
  if (entityIds.length === 0) return [];
  const rows = getDb()
    .select()
    .from(entityVersions)
    .where(
      and(
        eq(entityVersions.userId, ctx.userId),
        inArray(entityVersions.entityId, entityIds),
      ),
    )
    .orderBy(desc(entityVersions.createdAt))
    .limit(limit)
    .all();
  return rows.map((r) => {
    const snap = JSON.parse(
      openField(ctx.dek, ctx.userId, "version.payload", Buffer.from(r.payloadCt)),
    ) as Snapshot;
    const label = "name" in snap ? snap.name : snap.title;
    return {
      id: r.id,
      entityType: r.entityType as EntityType,
      entityId: r.entityId,
      rev: r.rev,
      actorId: r.actorId,
      createdAt: r.createdAt,
      label,
    };
  });
}
