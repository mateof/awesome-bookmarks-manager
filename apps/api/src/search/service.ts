import type { Bookmark } from "@awesome-bookmarks/shared";
import type { AuthedContext } from "../auth/session.js";
import { getSqlite } from "../db/client.js";
import { listBookmarks } from "../bookmarks/service.js";
import { listFolders } from "../folders/service.js";

export interface SnippetMatch {
  bookmarkId: string;
  snippet: string;
  score: number;
}

export interface SearchOptions {
  folderId?: string | null;
  fuzzy?: boolean;
}

/**
 * Run an FTS5 MATCH against the snapshot text index, scoped to the user.
 * The FTS5 table holds plaintext for searchability — we treat it as an
 * index, not a content store.
 */
export function searchSnapshots(
  ctx: AuthedContext,
  query: string,
  limit = 50,
): SnippetMatch[] {
  if (!query.trim()) return [];
  const sql = getSqlite();
  const safe = ftsQuote(query);
  const rows = sql
    .prepare(
      `SELECT bookmark_id,
              snippet(snapshots_fts, 2, '<mark>', '</mark>', '...', 24) AS snippet,
              rank
       FROM snapshots_fts
       WHERE user_id = ? AND snapshots_fts MATCH ?
       ORDER BY rank
       LIMIT ?`,
    )
    .all(ctx.userId, safe, limit) as Array<{
    bookmark_id: string;
    snippet: string;
    rank: number;
  }>;
  return rows.map((r) => ({
    bookmarkId: r.bookmark_id,
    snippet: r.snippet,
    score: r.rank,
  }));
}

export function search(
  ctx: AuthedContext,
  query: string,
  limit = 50,
  opts: SearchOptions = {},
) {
  const folderScope = opts.folderId
    ? buildDescendantFolderSet(ctx, opts.folderId)
    : null;

  const all = listBookmarks(ctx, { limit: 5000 });
  const inScope = folderScope
    ? all.filter((b) => b.folderId && folderScope.has(b.folderId))
    : all;

  const q = query.trim();
  if (!q) return [];

  // Scored set keyed by bookmark id. Lower score = better.
  const scored = new Map<
    string,
    { bookmark: Bookmark; score: number; snippet?: string }
  >();

  // Exact substring matches in title / url / description.
  const ql = q.toLowerCase();
  for (const b of inScope) {
    const inTitle = b.title.toLowerCase().includes(ql);
    const inUrl = b.url.toLowerCase().includes(ql);
    const inDesc = b.description?.toLowerCase().includes(ql) ?? false;
    if (inTitle) scored.set(b.id, { bookmark: b, score: 0 });
    else if (inUrl) scored.set(b.id, { bookmark: b, score: 1 });
    else if (inDesc) scored.set(b.id, { bookmark: b, score: 2 });
  }

  // FTS5 snapshot index hits (snippet attached for display).
  const ftsHits = searchSnapshots(ctx, q, limit * 2);
  const inScopeIds = new Set(inScope.map((b) => b.id));
  for (const hit of ftsHits) {
    if (folderScope && !inScopeIds.has(hit.bookmarkId)) continue;
    const existing = scored.get(hit.bookmarkId);
    if (existing) {
      existing.snippet = hit.snippet;
      existing.score = Math.min(existing.score, 3);
    } else {
      const b = inScope.find((x) => x.id === hit.bookmarkId);
      if (b)
        scored.set(b.id, { bookmark: b, score: 3, snippet: hit.snippet });
    }
  }

  // Fuzzy (Levenshtein) over title and URL host. Always-on: catches typos
  // and lets short queries find longer titles via per-word distance.
  if (opts.fuzzy !== false) {
    const threshold = fuzzyThreshold(ql);
    for (const b of inScope) {
      if (scored.has(b.id)) continue;
      const distance = bestWordDistance(ql, b.title, b.url);
      if (distance <= threshold) {
        scored.set(b.id, { bookmark: b, score: 10 + distance });
      }
    }
  }

  return [...scored.values()]
    .sort((a, b) => a.score - b.score)
    .slice(0, limit)
    .map(({ bookmark, snippet }) => ({ bookmark, snippet }));
}

function ftsQuote(input: string): string {
  return input
    .split(/\s+/)
    .filter(Boolean)
    .map((tok) => `"${tok.replaceAll('"', '""')}"`)
    .join(" ");
}

/** Index/upsert plaintext content for a bookmark. Called by snapshot worker. */
export function upsertSnapshotIndex(
  userId: string,
  bookmarkId: string,
  content: string,
) {
  const sql = getSqlite();
  sql
    .prepare(`DELETE FROM snapshots_fts WHERE bookmark_id = ?`)
    .run(bookmarkId);
  sql
    .prepare(
      `INSERT INTO snapshots_fts (bookmark_id, user_id, content) VALUES (?, ?, ?)`,
    )
    .run(bookmarkId, userId, content);
}

export function deleteSnapshotIndex(bookmarkId: string) {
  getSqlite()
    .prepare(`DELETE FROM snapshots_fts WHERE bookmark_id = ?`)
    .run(bookmarkId);
}

function buildDescendantFolderSet(
  ctx: AuthedContext,
  rootId: string,
): Set<string> {
  const folders = listFolders(ctx);
  const out = new Set<string>([rootId]);
  const stack = [rootId];
  while (stack.length > 0) {
    const cur = stack.pop()!;
    for (const f of folders) {
      if (f.parentId === cur && !out.has(f.id)) {
        out.add(f.id);
        stack.push(f.id);
      }
    }
  }
  return out;
}

function fuzzyThreshold(q: string): number {
  if (q.length <= 3) return 0;
  if (q.length <= 5) return 1;
  if (q.length <= 8) return 2;
  return 3;
}

function bestWordDistance(
  qLower: string,
  title: string,
  url: string,
): number {
  let best = Infinity;
  const titleWords = title.toLowerCase().split(/\s+/).filter(Boolean);
  for (const w of titleWords) {
    const d = levenshtein(qLower, w);
    if (d < best) best = d;
    if (best === 0) return 0;
  }
  // Compare against URL host (sans protocol / path) — typo-tolerant domain search.
  try {
    const host = new URL(url).host.toLowerCase();
    const d = levenshtein(qLower, host);
    if (d < best) best = d;
    // Also tokens of the host (e.g. "developer.mozilla.org" → mozilla, developer)
    for (const tok of host.split(/[.\-]/).filter(Boolean)) {
      const d2 = levenshtein(qLower, tok);
      if (d2 < best) best = d2;
    }
  } catch {
    /* invalid URL — skip */
  }
  return best;
}

function levenshtein(a: string, b: string): number {
  if (a === b) return 0;
  const al = a.length;
  const bl = b.length;
  if (al === 0) return bl;
  if (bl === 0) return al;
  // Quick reject if length difference already exceeds reasonable threshold.
  if (Math.abs(al - bl) > 5) return Math.abs(al - bl);
  const v0 = new Int32Array(bl + 1);
  const v1 = new Int32Array(bl + 1);
  for (let i = 0; i <= bl; i++) v0[i] = i;
  for (let i = 0; i < al; i++) {
    v1[0] = i + 1;
    for (let j = 0; j < bl; j++) {
      const cost = a.charCodeAt(i) === b.charCodeAt(j) ? 0 : 1;
      v1[j + 1] = Math.min(v1[j]! + 1, v0[j + 1]! + 1, v0[j]! + cost);
    }
    v0.set(v1);
  }
  return v0[bl]!;
}
