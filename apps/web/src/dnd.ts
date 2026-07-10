import {
  useDraggable,
  useDroppable,
} from "@dnd-kit/core";
import { useSortable } from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import type { Bookmark, Folder } from "@awesome-bookmarks/shared";
import type React from "react";

/**
 * Draggable helper for a folder card. Also acts as a droppable target so
 * other folders / bookmarks can be dropped into it.
 */
export function useFolderDrag(sf: Folder): {
  ref: (node: HTMLElement | null) => void;
  props: Record<string, unknown>;
  style: React.CSSProperties;
  isDragging: boolean;
  isOver: boolean;
} {
  const drag = useDraggable({
    id: `dnd-folder:${sf.id}`,
    data: {
      kind: "folder" as const,
      folderId: sf.id,
      parentId: sf.parentId,
    },
  });
  const drop = useDroppable({
    id: `dnd-into:${sf.id}`,
    data: {
      drop: "into-folder" as const,
      folderId: sf.id,
    },
  });
  const setRef = (node: HTMLElement | null) => {
    drag.setNodeRef(node);
    drop.setNodeRef(node);
  };
  return {
    ref: setRef,
    props: { ...drag.attributes, ...drag.listeners },
    style: {
      transform: CSS.Translate.toString(drag.transform),
      opacity: drag.isDragging ? 0.4 : undefined,
      outline: drop.isOver ? "2px dashed rgb(59 130 246)" : undefined,
      outlineOffset: drop.isOver ? "-2px" : undefined,
    },
    isDragging: drag.isDragging,
    isOver: drop.isOver,
  };
}

/**
 * Sortable helper for a bookmark card. Handles reordering within the
 * current folder and being dragged into another folder.
 */
export function useBookmarkSortable(b: Bookmark): {
  ref: (node: HTMLElement | null) => void;
  props: Record<string, unknown>;
  style: React.CSSProperties;
  isDragging: boolean;
} {
  const s = useSortable({
    id: `dnd-bookmark:${b.id}`,
    data: {
      kind: "bookmark" as const,
      bookmarkId: b.id,
      folderId: b.folderId,
    },
  });
  return {
    ref: s.setNodeRef,
    props: { ...s.attributes, ...s.listeners },
    style: {
      transform: CSS.Translate.toString(s.transform),
      transition: s.transition,
      opacity: s.isDragging ? 0.4 : undefined,
    },
    isDragging: s.isDragging,
  };
}

/**
 * Droppable-only helper used by the sidebar folder tree so a dragged
 * folder or bookmark can be dropped onto any entry.
 */
export function useSidebarFolderDrop(folderId: string): {
  ref: (node: HTMLElement | null) => void;
  isOver: boolean;
} {
  const drop = useDroppable({
    id: `dnd-sidebar-into:${folderId}`,
    data: {
      drop: "into-folder" as const,
      folderId,
    },
  });
  return { ref: drop.setNodeRef, isOver: drop.isOver };
}

export const BOOKMARK_SORTABLE_IDS = (bookmarks: Bookmark[]) =>
  bookmarks.map((b) => `dnd-bookmark:${b.id}`);

export function parseDropTargetFolderId(overId: string): string | null {
  if (overId.startsWith("dnd-into:")) return overId.slice("dnd-into:".length);
  if (overId.startsWith("dnd-sidebar-into:"))
    return overId.slice("dnd-sidebar-into:".length);
  return null;
}
