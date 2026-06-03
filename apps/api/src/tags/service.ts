import type { Tag } from "@awesome-bookmarks/shared";
import { and, asc, eq } from "drizzle-orm";
import { v4 as uuidv4 } from "uuid";
import type { AuthedContext } from "../auth/session.js";
import { getDb } from "../db/client.js";
import { tags } from "../db/schema.js";
import { Conflict, NotFound } from "../util/errors.js";

export function listTags(ctx: AuthedContext): Tag[] {
  return getDb()
    .select({ id: tags.id, name: tags.name, color: tags.color })
    .from(tags)
    .where(eq(tags.userId, ctx.userId))
    .orderBy(asc(tags.name))
    .all();
}

export function createTag(
  ctx: AuthedContext,
  input: { name: string; color: string },
): Tag {
  const existing = getDb()
    .select({ id: tags.id })
    .from(tags)
    .where(and(eq(tags.userId, ctx.userId), eq(tags.name, input.name)))
    .get();
  if (existing) throw Conflict("Tag with that name already exists");

  const id = uuidv4();
  getDb()
    .insert(tags)
    .values({ id, userId: ctx.userId, name: input.name, color: input.color })
    .run();
  return { id, name: input.name, color: input.color };
}

export function updateTag(
  ctx: AuthedContext,
  id: string,
  input: { name?: string; color?: string },
): Tag {
  const row = getDb()
    .select()
    .from(tags)
    .where(and(eq(tags.id, id), eq(tags.userId, ctx.userId)))
    .get();
  if (!row) throw NotFound("Tag not found");

  if (input.name !== undefined && input.name !== row.name) {
    const conflict = getDb()
      .select({ id: tags.id })
      .from(tags)
      .where(and(eq(tags.userId, ctx.userId), eq(tags.name, input.name)))
      .get();
    if (conflict) throw Conflict("Tag with that name already exists");
  }

  const update: Record<string, string> = {};
  if (input.name !== undefined) update.name = input.name;
  if (input.color !== undefined) update.color = input.color;
  if (Object.keys(update).length > 0) {
    getDb().update(tags).set(update).where(eq(tags.id, id)).run();
  }
  return {
    id,
    name: input.name ?? row.name,
    color: input.color ?? row.color,
  };
}

export function deleteTag(ctx: AuthedContext, id: string) {
  const row = getDb()
    .select({ id: tags.id })
    .from(tags)
    .where(and(eq(tags.id, id), eq(tags.userId, ctx.userId)))
    .get();
  if (!row) throw NotFound("Tag not found");
  getDb().delete(tags).where(eq(tags.id, id)).run();
}
