import type { Bookmark, Folder } from "@awesome-bookmarks/shared";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { Star } from "lucide-react";
import { useTranslation } from "react-i18next";
import { api } from "../api.js";

type Target =
  | { kind: "bookmark"; item: Bookmark }
  | { kind: "folder"; item: Folder };

/**
 * Star button that adds/removes a bookmark or folder from favourites.
 * Optimistic: the star fills immediately and rolls back if the request fails,
 * because this is a one-click action where waiting for a round trip feels
 * broken.
 */
export function FavoriteToggle({
  bookmark,
  folder,
  className = "",
  size = "h-4 w-4",
}: {
  bookmark?: Bookmark;
  folder?: Folder;
  className?: string;
  size?: string;
}) {
  const { t } = useTranslation();
  const qc = useQueryClient();

  const target: Target | null = bookmark
    ? { kind: "bookmark", item: bookmark }
    : folder
      ? { kind: "folder", item: folder }
      : null;

  const on = !!target?.item.favorite;
  const listKey = target?.kind === "folder" ? "folders" : "bookmarks";

  const toggle = useMutation({
    mutationFn: async () => {
      if (!target) throw new Error("FavoriteToggle needs a bookmark or a folder");
      if (target.kind === "bookmark") {
        await api.updateBookmark(target.item.id, { favorite: !on });
      } else {
        await api.updateFolder(target.item.id, { favorite: !on });
      }
    },
    onMutate: async () => {
      if (!target) return { previous: [] as [readonly unknown[], unknown][] };
      await qc.cancelQueries({ queryKey: [listKey] });
      const previous = qc.getQueriesData<(Bookmark | Folder)[]>({
        queryKey: [listKey],
      });
      for (const [key, list] of previous) {
        if (!Array.isArray(list)) continue;
        qc.setQueryData(
          key,
          list.map((it) =>
            it.id === target.item.id ? { ...it, favorite: !on } : it,
          ),
        );
      }
      return { previous };
    },
    onError: (_e, _v, context) => {
      for (const [key, list] of context?.previous ?? []) {
        qc.setQueryData(key, list);
      }
    },
    onSettled: () => {
      qc.invalidateQueries({ queryKey: ["bookmarks"] });
      qc.invalidateQueries({ queryKey: ["folders"] });
      if (target) qc.invalidateQueries({ queryKey: [target.kind, target.item.id] });
    },
  });

  if (!target) return null;

  return (
    <button
      type="button"
      aria-pressed={on}
      title={on ? t("favorites.remove") : t("favorites.add")}
      aria-label={on ? t("favorites.remove") : t("favorites.add")}
      onClick={(e) => {
        e.preventDefault();
        e.stopPropagation();
        toggle.mutate();
      }}
      className={`rounded p-1 transition-colors ${
        on
          ? "text-amber-500 hover:text-amber-600"
          : "text-slate-400 hover:text-amber-500"
      } ${className}`}
    >
      <Star className={size} fill={on ? "currentColor" : "none"} />
    </button>
  );
}
