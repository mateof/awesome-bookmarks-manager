import { useQuery } from "@tanstack/react-query";
import { FolderClosed, X } from "lucide-react";
import { useTranslation } from "react-i18next";
import { Link, useNavigate, useSearchParams } from "react-router-dom";
import { api } from "../api.js";

export function SearchPage() {
  const { t } = useTranslation();
  const [params] = useSearchParams();
  const nav = useNavigate();
  const q = params.get("q") ?? "";
  const folderId = params.get("folderId");

  const folders = useQuery({
    queryKey: ["folders"],
    queryFn: api.listFolders,
    enabled: !!folderId,
  });
  const folderName = folderId
    ? folders.data?.find((f) => f.id === folderId)?.name ?? null
    : null;

  const r = useQuery({
    queryKey: ["search", q, folderId],
    queryFn: () => api.search(q, { folderId: folderId ?? null }),
    enabled: q.length > 0,
  });

  const removeScope = () => {
    const next = new URLSearchParams(params);
    next.delete("folderId");
    nav(`/search?${next.toString()}`, { replace: true });
  };

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center gap-2">
        <h1 className="text-xl font-semibold">
          {t("search.pageTitle", { query: q })}
        </h1>
        {folderId && (
          <span className="flex items-center gap-1 rounded-full bg-slate-100 px-2 py-0.5 text-xs text-slate-700 dark:bg-slate-800 dark:text-slate-200">
            <FolderClosed className="h-3 w-3" />
            <span className="max-w-[12rem] truncate">
              {t("search.scopeChip", {
                folder: folderName ?? t("layout.folderFallback"),
              })}
            </span>
            <button
              type="button"
              onClick={removeScope}
              aria-label={t("search.removeScope")}
              className="rounded p-0.5 hover:bg-slate-200 dark:hover:bg-slate-700"
            >
              <X className="h-3 w-3" />
            </button>
          </span>
        )}
      </div>
      {!q && <div className="text-slate-400">{t("search.typeAbove")}</div>}
      {q && r.isLoading && <div className="text-slate-400">{t("search.searching")}</div>}
      <div className="space-y-2">
        {(r.data ?? []).map(({ bookmark, snippet }) => (
          <div
            key={bookmark.id}
            className="rounded border border-slate-200 bg-white p-3 dark:border-slate-800 dark:bg-slate-900"
          >
            <div className="flex items-center gap-2">
              <a
                href={bookmark.url}
                target="_blank"
                rel="noopener noreferrer"
                className="font-medium hover:underline"
              >
                {bookmark.title}
              </a>
              <Link
                to={`/bookmark/${bookmark.id}`}
                className="text-xs text-slate-400 hover:text-slate-900"
              >
                {t("bookmark.detailLink")}
              </Link>
            </div>
            <a
              href={bookmark.url}
              target="_blank"
              rel="noopener noreferrer"
              className="block text-xs text-slate-500 hover:underline"
            >
              {bookmark.url}
            </a>
            {snippet && (
              <div
                className="mt-1 text-sm text-slate-600 dark:text-slate-300"
                dangerouslySetInnerHTML={{ __html: snippet }}
              />
            )}
          </div>
        ))}
        {q && r.data && r.data.length === 0 && (
          <div className="text-slate-400">{t("search.noResults")}</div>
        )}
      </div>
    </div>
  );
}
