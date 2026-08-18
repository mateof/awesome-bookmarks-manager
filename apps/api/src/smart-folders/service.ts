import {
  type Bookmark,
  type CreateSmartFolderBody,
  type Folder,
  type SmartFolder,
  type SmartQuery,
  SmartQuerySchema,
  type UpdateSmartFolderBody,
  isEmptySmartQuery,
} from "@awesome-bookmarks/shared";
import { and, asc, eq } from "drizzle-orm";
import { v4 as uuidv4 } from "uuid";
import { openField, sealField } from "../auth/encryption.js";
import type { AuthedContext } from "../auth/session.js";
import { listBookmarks } from "../bookmarks/service.js";
import { getDb } from "../db/client.js";
import { smartFolders } from "../db/schema.js";
import { listFolders } from "../folders/service.js";
import { BadRequest, NotFound } from "../util/errors.js";

const NAME_AAD = "smartFolder.name";
const QUERY_AAD = "smartFolder.query";

interface Row {
  id: string;
  nameCt: Buffer;
  queryCt: Buffer;
  color: string;
  position: number;
  createdAt: string;
  updatedAt: string;
}

function decode(ctx: AuthedContext, row: Row): SmartFolder {
  const raw = openField(ctx.dek, ctx.userId, QUERY_AAD, row.queryCt);
  // A payload written by an older/newer build still yields a usable folder:
  // parse defensively and fall back to "matches nothing" rather than throwing
  // and taking the whole sidebar down with it.
  let query: SmartQuery;
  try {
    query = SmartQuerySchema.parse(JSON.parse(raw));
  } catch {
    query = SmartQuerySchema.parse({});
  }
  return {
    id: row.id,
    name: openField(ctx.dek, ctx.userId, NAME_AAD, row.nameCt),
    query,
    color: row.color,
    position: row.position,
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
  };
}

export function listSmartFolders(ctx: AuthedContext): SmartFolder[] {
  const rows = getDb()
    .select()
    .from(smartFolders)
    .where(eq(smartFolders.userId, ctx.userId))
    .orderBy(asc(smartFolders.position), asc(smartFolders.createdAt))
    .all();
  const out: SmartFolder[] = [];
  for (const r of rows) {
    try {
      out.push(
        decode(ctx, {
          id: r.id,
          nameCt: Buffer.from(r.nameCt),
          queryCt: Buffer.from(r.queryCt),
          color: r.color,
          position: r.position,
          createdAt: r.createdAt,
          updatedAt: r.updatedAt,
        }),
      );
    } catch (err) {
      console.warn(
        `[smart-folders] skip row ${r.id}: decode failed`,
        err instanceof Error ? err.message : err,
      );
    }
  }
  return out;
}

export function getSmartFolder(ctx: AuthedContext, id: string): SmartFolder {
  const row = getDb()
    .select()
    .from(smartFolders)
    .where(and(eq(smartFolders.id, id), eq(smartFolders.userId, ctx.userId)))
    .get();
  if (!row) throw NotFound("Smart folder not found");
  return decode(ctx, {
    id: row.id,
    nameCt: Buffer.from(row.nameCt),
    queryCt: Buffer.from(row.queryCt),
    color: row.color,
    position: row.position,
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
  });
}

function nextPosition(ctx: AuthedContext): number {
  const rows = getDb()
    .select({ position: smartFolders.position })
    .from(smartFolders)
    .where(eq(smartFolders.userId, ctx.userId))
    .all();
  return rows.reduce((max, r) => Math.max(max, r.position), -1) + 1;
}

export function createSmartFolder(
  ctx: AuthedContext,
  input: CreateSmartFolderBody,
): SmartFolder {
  const name = input.name.trim();
  if (!name) throw BadRequest("Name required");
  const id = uuidv4();
  getDb()
    .insert(smartFolders)
    .values({
      id,
      userId: ctx.userId,
      nameCt: sealField(ctx.dek, ctx.userId, NAME_AAD, name),
      queryCt: sealField(
        ctx.dek,
        ctx.userId,
        QUERY_AAD,
        JSON.stringify(input.query),
      ),
      color: input.color,
      position: nextPosition(ctx),
    })
    .run();
  return getSmartFolder(ctx, id);
}

export function updateSmartFolder(
  ctx: AuthedContext,
  id: string,
  input: UpdateSmartFolderBody,
): SmartFolder {
  getSmartFolder(ctx, id); // ownership check
  const patch: Record<string, unknown> = { updatedAt: new Date().toISOString() };
  if (input.name !== undefined) {
    const name = input.name.trim();
    if (!name) throw BadRequest("Name required");
    patch.nameCt = sealField(ctx.dek, ctx.userId, NAME_AAD, name);
  }
  if (input.query !== undefined) {
    patch.queryCt = sealField(
      ctx.dek,
      ctx.userId,
      QUERY_AAD,
      JSON.stringify(input.query),
    );
  }
  if (input.color !== undefined) patch.color = input.color;
  if (input.position !== undefined) patch.position = input.position;
  getDb().update(smartFolders).set(patch).where(eq(smartFolders.id, id)).run();
  return getSmartFolder(ctx, id);
}

export function deleteSmartFolder(ctx: AuthedContext, id: string) {
  getSmartFolder(ctx, id); // ownership check
  getDb().delete(smartFolders).where(eq(smartFolders.id, id)).run();
}

export interface SmartFolderContents {
  folders: Folder[];
  bookmarks: Bookmark[];
}

/**
 * Evaluate a saved query and return what it currently selects.
 *
 * The web app applies the same predicates client-side over lists it has
 * already loaded, which is why this exists rather than replacing it: a
 * round-trip per keystroke would be worse there, but an API or MCP client
 * should not have to download the whole library to answer "what is in this
 * folder?". The two must agree, so keep them in step — the rules are: tags
 * combine with AND or OR, `text` matches title/name, URL and description
 * case-insensitively, and `favorite` restricts to starred items.
 */
export function resolveSmartQuery(
  ctx: AuthedContext,
  query: SmartQuery,
): SmartFolderContents {
  // An empty query selects nothing rather than everything: it is the state a
  // half-built filter is in, and returning the entire library there would be
  // both surprising and expensive.
  if (isEmptySmartQuery(query)) return { folders: [], bookmarks: [] };

  const needle = query.text.trim().toLowerCase();
  const tagHit = (tagIds: string[] | undefined) => {
    if (query.tagIds.length === 0) return true;
    const own = new Set(tagIds ?? []);
    return query.match === "all"
      ? query.tagIds.every((id) => own.has(id))
      : query.tagIds.some((id) => own.has(id));
  };

  const folders = listFolders(ctx).filter(
    (f) =>
      tagHit(f.tagIds) &&
      (!query.favorite || f.favorite) &&
      (!needle || f.name.toLowerCase().includes(needle)),
  );
  const bookmarks = listBookmarks(ctx, {}).filter(
    (b) =>
      tagHit(b.tagIds) &&
      (!query.favorite || b.favorite) &&
      (!needle ||
        b.title.toLowerCase().includes(needle) ||
        b.url.toLowerCase().includes(needle) ||
        (b.description?.toLowerCase().includes(needle) ?? false)),
  );
  return { folders, bookmarks };
}

/** Resolve a saved folder by id. Throws NotFound when it does not exist. */
export function resolveSmartFolder(
  ctx: AuthedContext,
  id: string,
): SmartFolderContents & { smartFolder: SmartFolder } {
  const smartFolder = getSmartFolder(ctx, id);
  return { smartFolder, ...resolveSmartQuery(ctx, smartFolder.query) };
}
