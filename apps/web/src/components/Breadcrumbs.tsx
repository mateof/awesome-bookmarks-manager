import { ChevronRight, Home } from "lucide-react";
import { useTranslation } from "react-i18next";
import { Link } from "react-router-dom";
import { useFolderPath } from "../hooks.js";

interface Props {
  folderId: string | null;
  /** If set, rendered as a non-link trailing segment (e.g. bookmark title). */
  trailing?: string;
}

/**
 * Breadcrumbs from root → current folder. Each segment is a link except the
 * last (the active folder). Supports an optional trailing label for bookmark
 * detail pages.
 */
export function Breadcrumbs({ folderId, trailing }: Props) {
  const { t } = useTranslation();
  const path = useFolderPath(folderId);
  const lastFolderIdx = path.length - 1;

  return (
    <nav
      aria-label={t("breadcrumbs.breadcrumb")}
      className="flex flex-wrap items-center gap-1 text-sm"
    >
      <Link
        to="/"
        className="flex items-center gap-1 rounded px-1.5 py-0.5 text-slate-500 hover:bg-slate-100 hover:text-slate-900 dark:hover:bg-slate-800 dark:hover:text-slate-100"
      >
        <Home className="h-3 w-3" />
        <span>{t("breadcrumbs.home")}</span>
      </Link>
      {path.map((f, i) => {
        const isLast = i === lastFolderIdx && !trailing;
        return (
          <span key={f.id} className="flex items-center gap-1">
            <ChevronRight className="h-3 w-3 text-slate-300" />
            {isLast ? (
              <span className="rounded bg-slate-100 px-1.5 py-0.5 font-medium dark:bg-slate-800">
                {f.name}
              </span>
            ) : (
              <Link
                to={`/folder/${f.id}`}
                className="rounded px-1.5 py-0.5 text-slate-500 hover:bg-slate-100 hover:text-slate-900 dark:hover:bg-slate-800 dark:hover:text-slate-100"
              >
                {f.name}
              </Link>
            )}
          </span>
        );
      })}
      {trailing && (
        <span className="flex items-center gap-1">
          <ChevronRight className="h-3 w-3 text-slate-300" />
          <span className="rounded bg-slate-100 px-1.5 py-0.5 font-medium dark:bg-slate-800">
            {trailing}
          </span>
        </span>
      )}
    </nav>
  );
}
