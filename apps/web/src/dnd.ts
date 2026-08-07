import { useDroppable } from "@dnd-kit/core";
import { useSortable } from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import type { Bookmark, Folder } from "@awesome-bookmarks/shared";
import type React from "react";

/**
 * DnD model
 * ---------
 * Folders and bookmarks are both *sortable* items, so dragging one over
 * another of the same kind reorders them. Cross-kind and cross-container
 * drops are interpreted in Layout's onDragEnd:
 *
 * - drop a bookmark onto a folder card        → move the bookmark into it
 * - drop a folder onto another folder (grid)  → reorder folders
 * - drop anything onto a sidebar folder / Home→ move it into that folder / root
 *
 * Sortable item ids:  `folder:<id>`, `bookmark:<id>`
 * Nest droppable ids: `nest:<scope>:<folderId|root>` (scope = side | card),
 *   scoped so the sidebar and grid copies of one folder don't collide.
 */

export interface DragData {
  kind: "folder" | "bookmark";
  id: string;
  parentId?: string | null; // folders
  folderId?: string | null; // bookmarks
}

export interface NestData {
  target: "folder";
  folderId: string | null; // null = root
}

interface SortableResult {
  ref: (node: HTMLElement | null) => void;
  props: Record<string, unknown>;
  style: React.CSSProperties;
  isDragging: boolean;
}

export function useFolderSortable(sf: Folder): SortableResult {
  const s = useSortable({
    id: `folder:${sf.id}`,
    data: { kind: "folder", id: sf.id, parentId: sf.parentId } satisfies DragData,
  });
  return {
    ref: s.setNodeRef,
    props: { ...s.attributes, ...s.listeners },
    style: {
      transform: CSS.Transform.toString(s.transform),
      transition: s.transition,
      opacity: s.isDragging ? 0.4 : undefined,
      zIndex: s.isDragging ? 20 : undefined,
    },
    isDragging: s.isDragging,
  };
}

export function useBookmarkSortable(b: Bookmark): SortableResult {
  const s = useSortable({
    id: `bookmark:${b.id}`,
    data: { kind: "bookmark", id: b.id, folderId: b.folderId } satisfies DragData,
  });
  return {
    ref: s.setNodeRef,
    props: { ...s.attributes, ...s.listeners },
    style: {
      transform: CSS.Transform.toString(s.transform),
      transition: s.transition,
      opacity: s.isDragging ? 0.4 : undefined,
      zIndex: s.isDragging ? 20 : undefined,
    },
    isDragging: s.isDragging,
  };
}

/**
 * Droppable "nest" target: a sidebar folder entry, or the Home/root entry.
 * Pass null for the root.
 *
 * The same folder can be visible in more than one place at once (the sidebar
 * tree and a card in the grid), and dnd-kit requires every droppable id to be
 * unique. The `scope` disambiguates them so both stay live; without it the two
 * registrations collide and only one keeps a measured rect, which silently
 * breaks dropping onto whichever copy loses. The drop handler reads the target
 * folder from `data.folderId`, not from the id, so the scope is display-only.
 */
export function useNestDrop(
  folderId: string | null,
  scope: "side" | "card" = "side",
): {
  ref: (node: HTMLElement | null) => void;
  isOver: boolean;
} {
  const base = folderId === null ? "root" : folderId;
  const drop = useDroppable({
    id: `nest:${scope}:${base}`,
    data: { target: "folder", folderId } satisfies NestData,
  });
  return { ref: drop.setNodeRef, isOver: drop.isOver };
}

export const FOLDER_SORTABLE_IDS = (folders: Folder[]) =>
  folders.map((f) => `folder:${f.id}`);

export const BOOKMARK_SORTABLE_IDS = (bookmarks: Bookmark[]) =>
  bookmarks.map((b) => `bookmark:${b.id}`);
