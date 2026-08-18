import type { SmartQuery } from "@awesome-bookmarks/shared";

/**
 * A smart folder is nothing but the `/filter` page's query string with a name
 * on it. Keeping one canonical translation in both directions is what lets the
 * same page render a saved folder, an ad-hoc filter and a shared link without
 * any of them being a special case.
 *
 * Params: `tags` (csv), `m` (all|any), `q` (free text), `fav` (1), plus `sf`
 * carrying the saved folder's id when one is open.
 */

export const EMPTY_QUERY: SmartQuery = {
  tagIds: [],
  match: "any",
  text: "",
  favorite: false,
};

export function queryFromParams(sp: URLSearchParams): SmartQuery {
  return {
    tagIds: (sp.get("tags") ?? "").split(",").filter(Boolean),
    match: sp.get("m") === "all" ? "all" : "any",
    text: sp.get("q") ?? "",
    favorite: sp.get("fav") === "1",
  };
}

export function paramsFromQuery(q: SmartQuery): URLSearchParams {
  const sp = new URLSearchParams();
  if (q.tagIds.length > 0) sp.set("tags", q.tagIds.join(","));
  // The mode only means something with two or more tags; omitting it keeps
  // shared URLs short and stops "all" from looking active when it is not.
  if (q.tagIds.length > 1 && q.match === "all") sp.set("m", "all");
  if (q.text.trim()) sp.set("q", q.text.trim());
  if (q.favorite) sp.set("fav", "1");
  return sp;
}

export function filterUrl(q: SmartQuery, smartFolderId?: string): string {
  const sp = paramsFromQuery(q);
  if (smartFolderId) sp.set("sf", smartFolderId);
  const s = sp.toString();
  return `/filter${s ? `?${s}` : ""}`;
}

export function isEmptyQuery(q: SmartQuery): boolean {
  return q.tagIds.length === 0 && q.text.trim() === "" && !q.favorite;
}

/** True when two queries would select the same items. */
export function sameQuery(a: SmartQuery, b: SmartQuery): boolean {
  return (
    a.text.trim() === b.text.trim() &&
    a.favorite === b.favorite &&
    // The match mode is only observable with two or more tags.
    (a.tagIds.length > 1 ? a.match : "any") ===
      (b.tagIds.length > 1 ? b.match : "any") &&
    a.tagIds.length === b.tagIds.length &&
    [...a.tagIds].sort().join(",") === [...b.tagIds].sort().join(",")
  );
}
