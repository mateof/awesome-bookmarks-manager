import type { Bookmark } from "@awesome-bookmarks/shared";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { Star } from "lucide-react";
import { useTranslation } from "react-i18next";
import { api } from "../api.js";

/**
 * Star button that adds/removes a bookmark from favourites. Optimistic: the
 * star fills immediately and rolls back if the request fails, because this is
 * a one-click action where waiting for a round trip feels broken.
 */
export function FavoriteToggle({
  bookmark,
  className = "",
  size = "h-4 w-4",
}: {
  bookmark: Bookmark;
  className?: string;
  size?: string;
}) {
  const { t } = useTranslation();
  const qc = useQueryClient();
  const on = !!bookmark.favorite;

  const toggle = useMutation({
    mutationFn: () => api.updateBookmark(bookmark.id, { favorite: !on }),
    onMutate: async () => {
      await qc.cancelQueries({ queryKey: ["bookmarks"] });
      const previous = qc.getQueriesData<Bookmark[]>({ queryKey: ["bookmarks"] });
      for (const [key, list] of previous) {
        if (!Array.isArray(list)) continue;
        qc.setQueryData(
          key,
          list.map((b) => (b.id === bookmark.id ? { ...b, favorite: !on } : b)),
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
      qc.invalidateQueries({ queryKey: ["bookmark", bookmark.id] });
      qc.invalidateQueries({ queryKey: ["favorites"] });
    },
  });

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
