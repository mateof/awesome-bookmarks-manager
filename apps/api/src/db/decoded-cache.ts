import type { Bookmark, Folder } from "@awesome-bookmarks/shared";
import { keyCache } from "../auth/key-cache.js";
import { getSqlite } from "./client.js";

/**
 * In-process cache of *decrypted* folder and bookmark lists.
 *
 * Reading the rows is not what costs: on this schema, pulling 20.000 encrypted
 * bookmarks out of SQLite takes about 48 ms and decrypting their three sealed
 * fields takes about 193 ms. The database is the cheap quarter. So the thing
 * worth caching is the plaintext, and the only place it may legitimately live
 * is this process, next to the DEKs that produced it.
 *
 * That is also why this is not Redis: moving the plaintext into another
 * service would take it outside the boundary the whole encryption design is
 * built around, and would add a network hop to replace an in-process call.
 *
 * ## Staying correct
 *
 * Validity is derived from the data rather than announced by the writers. Each
 * entry stores a signature — row count, sum of `rev`, latest `updated_at` —
 * recomputed on every read for about 2 ms. An insert or a delete moves the
 * count; an edit bumps `rev`; anything else that touches a row moves
 * `updated_at`. A cache that checks itself cannot be left stale by a mutation
 * path that forgot to call an invalidator, which is exactly the failure mode
 * hand-maintained invalidation produces months later.
 *
 * `invalidate()` still exists for the paths that change a row without bumping
 * `rev` (moves), as a belt to that signature's braces.
 */

interface Entry<T> {
  signature: string;
  value: T[];
}

const bookmarkCache = new Map<string, Entry<Bookmark>>();
const folderCache = new Map<string, Entry<Folder>>();

/**
 * Plaintext must never outlive the key that protects it. The DEK cache already
 * evicts on idle and hard TTLs and zeroes the buffer; this rides along, so a
 * user whose key has gone also has no decrypted content left behind.
 */
keyCache.onEvict((userId) => invalidate(userId));

/**
 * The signature covers everything the user can *see*, not just what they own.
 *
 * Shared content is rows reached through a group or a key scope, written by
 * other people.
 * A signature scoped to `user_id` would never move when a colleague edits the
 * shared folder, and the member would keep serving a stale list until their
 * own key expired. The subquery keeps this self-checking rather than relying
 * on the writer to remember who else is affected, which is the property this
 * whole module is built on.
 */
function signatureFor(table: "bookmarks" | "folders", userId: string): string {
  const row = getSqlite()
    .prepare(
      `SELECT count(*) AS n,
              COALESCE(SUM(rev), 0) AS r,
              COALESCE(MAX(updated_at), '') AS m
       FROM ${table}
       WHERE deleted_at IS NULL
         AND (user_id = ?
              OR key_group_id IN (
                SELECT group_id FROM group_members WHERE user_id = ?
              )
              OR key_scope_id IN (
                SELECT scope_id FROM key_scope_grants
                WHERE group_id IN (
                  SELECT group_id FROM group_members WHERE user_id = ?
                )
              ))`,
    )
    .get(userId, userId, userId) as { n: number; r: number; m: string };
  return `${row.n}:${row.r}:${row.m}`;
}

function read<T>(
  cache: Map<string, Entry<T>>,
  table: "bookmarks" | "folders",
  userId: string,
  compute: () => T[],
): T[] {
  const signature = signatureFor(table, userId);
  const hit = cache.get(userId);
  if (hit && hit.signature === signature) return hit.value;
  const value = compute();
  cache.set(userId, { signature, value });
  return value;
}

/**
 * The user's whole decrypted bookmark list, in the same order the SQL query
 * produces. Callers must treat the array as read-only: it is shared.
 */
export function cachedBookmarks(
  userId: string,
  compute: () => Bookmark[],
): Bookmark[] {
  return read(bookmarkCache, "bookmarks", userId, compute);
}

export function cachedFolders(
  userId: string,
  compute: () => Folder[],
): Folder[] {
  return read(folderCache, "folders", userId, compute);
}

/** Drop a user's decrypted lists. Safe to call more often than needed. */
export function invalidate(userId: string) {
  bookmarkCache.delete(userId);
  folderCache.delete(userId);
}

/** Used by tests and by anything that rewrites rows wholesale (restore). */
export function invalidateAll() {
  bookmarkCache.clear();
  folderCache.clear();
}

/** Entry counts, for diagnostics. */
export function cacheStats() {
  return { bookmarks: bookmarkCache.size, folders: folderCache.size };
}
