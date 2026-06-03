import { useQuery } from "@tanstack/react-query";
import type { Bookmark, Folder } from "@awesome-bookmarks/shared";
import { useMemo } from "react";
import { matchPath, useLocation } from "react-router-dom";
import { api } from "./api.js";

/**
 * The folder id of the currently-active context. Used by the sidebar tree to
 * highlight the right node regardless of whether the user is on a folder
 * page (`/folder/:id`) or a bookmark detail page (`/bookmark/:id`).
 */
export function useActiveFolderId(): string | null {
  const loc = useLocation();
  const folderMatch = matchPath("/folder/:id", loc.pathname);
  const bookmarkMatch = matchPath("/bookmark/:id", loc.pathname);

  // Same query key as Layout — gets deduped from cache instantly.
  const bookmarks = useQuery({
    queryKey: ["bookmarks", "all"],
    queryFn: () => api.listBookmarks({}),
    enabled: !!bookmarkMatch,
  });

  return useMemo(() => {
    if (folderMatch?.params.id) return folderMatch.params.id;
    if (bookmarkMatch?.params.id) {
      const b = bookmarks.data?.find((x) => x.id === bookmarkMatch.params.id);
      return b?.folderId ?? null;
    }
    return null;
  }, [folderMatch, bookmarkMatch, bookmarks.data]);
}

/**
 * Walk up the folder tree to build the path root → folder. Returns an
 * ordered array (root first). Returns [] for null id.
 */
export function buildFolderPath(
  folders: Folder[],
  folderId: string | null,
): Folder[] {
  if (!folderId) return [];
  const byId = new Map(folders.map((f) => [f.id, f]));
  const path: Folder[] = [];
  let cursor: string | null = folderId;
  const seen = new Set<string>();
  while (cursor) {
    if (seen.has(cursor)) break; // cycle guard
    seen.add(cursor);
    const node = byId.get(cursor);
    if (!node) break;
    path.unshift(node);
    cursor = node.parentId;
  }
  return path;
}

export function useFolderPath(folderId: string | null): Folder[] {
  const folders = useQuery({
    queryKey: ["folders"],
    queryFn: api.listFolders,
  });
  return useMemo(
    () => buildFolderPath(folders.data ?? [], folderId),
    [folders.data, folderId],
  );
}

export function useBookmarkById(id: string | null | undefined): Bookmark | undefined {
  const bookmarks = useQuery({
    queryKey: ["bookmarks", "all"],
    queryFn: () => api.listBookmarks({}),
    enabled: !!id,
  });
  return id ? bookmarks.data?.find((b) => b.id === id) : undefined;
}
