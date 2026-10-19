import { AutomationInputSchema, type Bookmark } from "@awesome-bookmarks/shared";
import type { AuthedContext } from "../auth/session.js";
import { deleteAutomation, setAutomation } from "../autofill/service.js";
import { storedInput } from "../autofill/store.js";
import { getBookmark, updateBookmark } from "../bookmarks/service.js";
import type { BookmarkSnapshot } from "./service.js";

export function restoreBookmarkVersion(
  ctx: AuthedContext,
  id: string,
  s: BookmarkSnapshot,
): Bookmark {
  const restored = updateBookmark(ctx, id, {
    title: s.title,
    url: s.url,
    description: s.description,
    bgColor: s.bgColor,
    folderId: s.folderId,
    tagIds: s.tagIds,
  });
  if (!("automation" in s)) return restored;
  const wanted = s.automation ?? null;
  if (JSON.stringify(storedInput(ctx, id)) === JSON.stringify(wanted)) return restored;
  if (wanted) {
    setAutomation(ctx, id, AutomationInputSchema.parse(wanted), { approve: true });
  } else {
    deleteAutomation(ctx, id);
  }
  return getBookmark(ctx, id);
}
