/**
 * Small client-side fuzzy matching for the instant searchers (Spotlight, panel
 * search). Exact substring hits rank first; otherwise a Levenshtein distance
 * on words (and their prefixes) tolerates typos. Lower score = better match;
 * null = no match.
 */

export function levenshtein(a: string, b: string): number {
  if (a === b) return 0;
  const al = a.length;
  const bl = b.length;
  if (al === 0) return bl;
  if (bl === 0) return al;
  let prev = new Array<number>(bl + 1);
  let curr = new Array<number>(bl + 1);
  for (let j = 0; j <= bl; j++) prev[j] = j;
  for (let i = 1; i <= al; i++) {
    curr[0] = i;
    const ac = a.charCodeAt(i - 1);
    for (let j = 1; j <= bl; j++) {
      const cost = ac === b.charCodeAt(j - 1) ? 0 : 1;
      curr[j] = Math.min(prev[j]! + 1, curr[j - 1]! + 1, prev[j - 1]! + cost);
    }
    const tmp = prev;
    prev = curr;
    curr = tmp;
  }
  return prev[bl]!;
}

function maxDist(len: number): number {
  if (len <= 3) return 1;
  if (len <= 6) return 2;
  return 3;
}

export function fuzzyScore(query: string, text: string): number | null {
  const q = query.trim().toLowerCase();
  if (!q) return 0;
  const s = text.toLowerCase();
  const idx = s.indexOf(q);
  if (idx >= 0) return idx; // substring: 0 = starts with, higher = later
  const md = maxDist(q.length);
  let best = Number.POSITIVE_INFINITY;
  for (const w of s.split(/[^\p{L}\p{N}]+/u)) {
    if (!w) continue;
    const d = Math.min(levenshtein(q, w), levenshtein(q, w.slice(0, q.length + 1)));
    if (d < best) best = d;
    if (best === 0) break;
  }
  return best <= md ? 1000 + best : null;
}

/** Best (lowest) score across several fields; null if none match. */
export function fuzzyScoreAny(query: string, ...texts: string[]): number | null {
  let best: number | null = null;
  for (const t of texts) {
    const s = fuzzyScore(query, t);
    if (s !== null && (best === null || s < best)) best = s;
  }
  return best;
}
