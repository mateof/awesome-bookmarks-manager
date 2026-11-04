import type { ResultSort, ResultWindow } from "@awesome-bookmarks/shared";
import { Star } from "lucide-react";
import { useTranslation } from "react-i18next";
import type { ResultType, ResultView } from "../lib/resultView.js";

const SORTS: ResultSort[] = ["default", "newest", "oldest", "updated", "name", "site"];
const WINDOWS: ResultWindow[] = ["week", "month", "year"];
const TYPES: ResultType[] = ["all", "folders", "bookmarks"];

const SELECT =
  "rounded border border-slate-300 bg-white px-2 py-1 text-xs text-slate-700 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-200";

export function ResultControls({
  view,
  onChange,
  defaultSortLabel,
  showType = true,
  favorite,
  onFavoriteChange,
}: {
  view: ResultView;
  onChange: (view: ResultView) => void;
  defaultSortLabel?: string;
  showType?: boolean;
  favorite?: boolean;
  onFavoriteChange?: (favorite: boolean) => void;
}) {
  const { t } = useTranslation();

  return (
    <div data-testid="result-controls" className="flex flex-wrap items-center gap-1.5">
      <label className="flex items-center gap-1 text-xs text-slate-500">
        {t("results.sortLabel")}
        <select
          value={view.sort}
          onChange={(e) => onChange({ ...view, sort: e.target.value as ResultSort })}
          className={SELECT}
        >
          {SORTS.map((sort) => (
            <option key={sort} value={sort}>
              {sort === "default" && defaultSortLabel
                ? defaultSortLabel
                : t(`results.sort.${sort}`)}
            </option>
          ))}
        </select>
      </label>
      <label className="flex items-center gap-1 text-xs text-slate-500">
        {t("results.sinceLabel")}
        <select
          value={view.since ?? ""}
          onChange={(e) =>
            onChange({ ...view, since: (e.target.value || null) as ResultWindow | null })
          }
          className={SELECT}
        >
          <option value="">{t("results.since.any")}</option>
          {WINDOWS.map((since) => (
            <option key={since} value={since}>
              {t(`results.since.${since}`)}
            </option>
          ))}
        </select>
      </label>
      {showType && (
        <div role="group" aria-label={t("results.typeLabel")} className="flex items-center gap-1">
          {TYPES.map((type) => (
            <button
              key={type}
              type="button"
              aria-pressed={view.type === type}
              onClick={() => onChange({ ...view, type })}
              className={`rounded-full border px-2.5 py-0.5 text-xs ${
                view.type === type
                  ? "border-slate-900 bg-slate-900 text-white dark:border-slate-100 dark:bg-slate-100 dark:text-slate-900"
                  : "border-slate-300 text-slate-600 dark:border-slate-700 dark:text-slate-300"
              }`}
            >
              {t(`results.type.${type}`)}
            </button>
          ))}
        </div>
      )}
      {onFavoriteChange && (
        <button
          type="button"
          aria-pressed={!!favorite}
          onClick={() => onFavoriteChange(!favorite)}
          className={`flex items-center gap-1 rounded-full border px-2.5 py-0.5 text-xs ${
            favorite
              ? "border-amber-400 bg-amber-100 text-amber-800 dark:border-amber-600 dark:bg-amber-900/40 dark:text-amber-300"
              : "border-slate-300 text-slate-600 hover:bg-slate-100 dark:border-slate-700 dark:text-slate-300 dark:hover:bg-slate-800"
          }`}
        >
          <Star className={`h-3 w-3 ${favorite ? "fill-amber-500 text-amber-500" : ""}`} />
          {t("smart.onlyFavorites")}
        </button>
      )}
    </div>
  );
}
