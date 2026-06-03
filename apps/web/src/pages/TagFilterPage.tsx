import { useQuery } from "@tanstack/react-query";
import { ExternalLink, FolderClosed, Tag as TagIcon } from "lucide-react";
import { useTranslation } from "react-i18next";
import { Link, useParams } from "react-router-dom";
import { api } from "../api.js";
import { TagChipList } from "../components/TagChip.js";

export function TagFilterPage() {
  const { t } = useTranslation();
  const { id } = useParams<{ id: string }>();
  const tagsQ = useQuery({ queryKey: ["tags"], queryFn: api.listTags });
  const foldersQ = useQuery({
    queryKey: ["folders"],
    queryFn: api.listFolders,
  });
  const bookmarksQ = useQuery({
    queryKey: ["bookmarks", "all"],
    queryFn: () => api.listBookmarks({}),
  });

  const tag = tagsQ.data?.find((t) => t.id === id) ?? null;
  const matchingFolders =
    foldersQ.data?.filter((f) => (f.tagIds ?? []).includes(id ?? "")) ?? [];
  const matchingBookmarks =
    bookmarksQ.data?.filter((b) => (b.tagIds ?? []).includes(id ?? "")) ?? [];

  if (!tag && !tagsQ.isLoading) {
    return (
      <div className="text-sm text-slate-400">{t("tags.notFound")}</div>
    );
  }

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-2">
        <TagIcon className="h-5 w-5" style={{ color: tag?.color }} />
        <h1 className="text-xl font-semibold">
          {t("tags.filterTitle", { name: tag?.name ?? "" })}
        </h1>
        <span className="text-xs text-slate-500">
          {t("tags.filterSummary", {
            folders: matchingFolders.length,
            bookmarks: matchingBookmarks.length,
          })}
        </span>
      </div>

      {matchingFolders.length > 0 && (
        <section>
          <h2 className="mb-2 text-xs font-medium uppercase text-slate-500">
            {t("folder.foldersSection")}
          </h2>
          <div className="grid grid-cols-1 gap-2 md:grid-cols-2 lg:grid-cols-3">
            {matchingFolders.map((f) => (
              <Link
                key={f.id}
                to={`/folder/${f.id}`}
                className="flex items-center gap-2 rounded border border-slate-200 bg-white p-3 hover:bg-slate-50 dark:border-slate-800 dark:bg-slate-900 dark:hover:bg-slate-800"
              >
                {f.iconBlobPath ? (
                  <img
                    src={api.folderIconUrl(f.id)}
                    alt=""
                    className="h-6 w-6 rounded object-cover"
                  />
                ) : (
                  <FolderClosed className="h-6 w-6 text-slate-500" />
                )}
                <div className="flex flex-1 flex-col gap-1 overflow-hidden">
                  <span className="truncate text-sm font-medium">{f.name}</span>
                  <TagChipList
                    tagIds={f.tagIds ?? []}
                    allTags={tagsQ.data ?? []}
                    size="sm"
                  />
                </div>
              </Link>
            ))}
          </div>
        </section>
      )}

      {matchingBookmarks.length > 0 && (
        <section>
          <h2 className="mb-2 text-xs font-medium uppercase text-slate-500">
            {t("folder.bookmarksSection")}
          </h2>
          <div className="grid grid-cols-1 gap-2 md:grid-cols-2 lg:grid-cols-3">
            {matchingBookmarks.map((b) => (
              <div
                key={b.id}
                className="flex items-start gap-2 rounded border border-slate-200 bg-white p-3 dark:border-slate-800 dark:bg-slate-900"
              >
                {b.iconBlobPath ? (
                  <img
                    src={api.bookmarkIconUrl(b.id)}
                    alt=""
                    className="h-8 w-8 shrink-0 rounded object-cover"
                  />
                ) : (
                  <ExternalLink className="h-5 w-5 shrink-0 text-slate-400" />
                )}
                <div className="flex-1 overflow-hidden">
                  <Link
                    to={`/bookmark/${b.id}`}
                    className="block truncate text-sm font-medium hover:underline"
                  >
                    {b.title}
                  </Link>
                  <a
                    href={b.url}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="block truncate text-xs text-slate-500 hover:underline"
                  >
                    {b.url}
                  </a>
                  <div className="mt-1">
                    <TagChipList
                      tagIds={b.tagIds ?? []}
                      allTags={tagsQ.data ?? []}
                      size="sm"
                    />
                  </div>
                </div>
                <a
                  href={b.url}
                  target="_blank"
                  rel="noopener noreferrer"
                  title={t("bookmark.openUrlTitle")}
                  className="shrink-0 rounded p-1 text-slate-400 hover:bg-slate-100 hover:text-slate-900 dark:hover:bg-slate-800 dark:hover:text-slate-100"
                >
                  <ExternalLink className="h-4 w-4" />
                </a>
              </div>
            ))}
          </div>
        </section>
      )}

      {matchingFolders.length === 0 && matchingBookmarks.length === 0 && (
        <div className="text-sm text-slate-400">{t("tags.filterEmpty")}</div>
      )}
    </div>
  );
}
