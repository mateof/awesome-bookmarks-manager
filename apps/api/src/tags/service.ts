import { type ApplyTagsResult, pickTagColor } from "@awesome-bookmarks/shared";
import { getFolder, updateFolder } from "../folders/service.js";
import { getBookmark, updateBookmark } from "../bookmarks/service.js";
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
  input: { name: string; color?: string },
): Tag {
  // Chosen here rather than by the caller: this is the only place that can see
  // every tag this user already has, which is what "a colour nothing else is
  // using" needs. A client picking from its own cached list gets it wrong the
  // moment two tags are created in a row.
  const color = input.color ?? pickTagColor(listTags(ctx));
  const existing = getDb()
    .select({ id: tags.id })
    .from(tags)
    .where(and(eq(tags.userId, ctx.userId), eq(tags.name, input.name)))
    .get();
  if (existing) throw Conflict("Tag with that name already exists");

  const id = uuidv4();
  getDb()
    .insert(tags)
    .values({ id, userId: ctx.userId, name: input.name, color })
    .run();
  return { id, name: input.name, color };
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

/**
 * Add tags to many folders and bookmarks in one call.
 *
 * Deliberately goes through `updateFolder` / `updateBookmark` rather than
 * writing the join rows directly. Those carry the write permission check, the
 * revision bump and the version history, and a bulk path that reimplemented
 * them would be a second place for the rules to drift out of step — which in
 * this codebase has already happened once, with the jobs that opened rows using
 * the wrong key.
 *
 * An item the caller cannot write is counted and skipped rather than failing
 * the batch: a selection that happens to include one read-only shared folder
 * should still tag the other forty.
 */
export function applyTags(
  ctx: AuthedContext,
  input: { folderIds: string[]; bookmarkIds: string[]; tagIds: string[] },
): ApplyTagsResult {
  let folders = 0;
  let bookmarks = 0;
  let skipped = 0;

  for (const id of input.folderIds) {
    try {
      const current = getFolder(ctx, id);
      const next = union(current.tagIds ?? [], input.tagIds);
      // Nothing new on this one: skip the write rather than bump a revision
      // and record a version that says nothing changed.
      if (next.length === (current.tagIds ?? []).length) continue;
      updateFolder(ctx, id, { tagIds: next });
      folders++;
    } catch {
      skipped++;
    }
  }

  for (const id of input.bookmarkIds) {
    try {
      const current = getBookmark(ctx, id);
      const next = union(current.tagIds ?? [], input.tagIds);
      if (next.length === (current.tagIds ?? []).length) continue;
      updateBookmark(ctx, id, { tagIds: next });
      bookmarks++;
    } catch {
      skipped++;
    }
  }

  return { folders, bookmarks, skipped };
}

function union(current: string[], adding: string[]): string[] {
  const out = new Set(current);
  for (const id of adding) out.add(id);
  return [...out];
}
