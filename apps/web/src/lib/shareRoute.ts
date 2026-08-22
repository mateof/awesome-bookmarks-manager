import type { SharedItem } from "@awesome-bookmarks/shared";

/**
 * Where a share opens.
 *
 * Since key scopes, sharing hands the recipient the **same row**, so a shared
 * folder is a folder and opens on the folder page: breadcrumbs, tags,
 * attachments, the view modes, the same dialogs. There is no reason left for a
 * reduced second copy of that page, and having one meant every feature had to
 * be built twice or, in practice, once.
 *
 * `/shared/:id` stays for shares made before that, whose content only ever
 * existed as a materialised copy and has no row to open.
 */
export function routeForShare(
  s: Pick<SharedItem, "id" | "sourceType" | "sourceId" | "sourceReachable">,
): string {
  if (!s.sourceReachable) return `/shared/${s.id}`;
  if (s.sourceType === "folder") return `/folder/${s.sourceId}`;
  if (s.sourceType === "database") return `/databases/${s.sourceId}`;
  return `/bookmark/${s.sourceId}`;
}
