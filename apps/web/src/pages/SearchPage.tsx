import { useQuery } from "@tanstack/react-query";
import { ArrowLeft, FolderClosed, X } from "lucide-react";
import { useMemo } from "react";
import { useTranslation } from "react-i18next";
import { Link, useNavigate, useSearchParams } from "react-router-dom";
import { api } from "../api.js";
import { FolderTagFilter, type TagCandidate } from "../components/FolderTagFilter.js";
import { ResultControls } from "../components/ResultControls.js";
import { TagChipList } from "../components/TagChip.js";
import { type ResultView, viewFromParams, writeView } from "../lib/resultView.js";

export function SearchPage() {
  const { t } = useTranslation();
  const [params, setParams] = useSearchParams();
  const nav = useNavigate();
  const q = params.get("q") ?? "";
  const folderId = params.get("folderId");
  const view = useMemo(() => viewFromParams(params), [params]);
  const favorite = params.get("fav") === "1";
  const tagIds = useMemo(
    () => (params.get("tags") ?? "").split(",").filter(Boolean),
    [params],
  );

  const goBack = () => {
    // `window.history.state?.idx` is set by react-router; if we're not the
    // first entry, go back. Otherwise (e.g. direct link to /search) fall
    // back to home so the button never feels broken.
    const idx = (window.history.state as { idx?: number } | null)?.idx ?? 0;
    if (idx > 0) nav(-1);
    else nav("/", { replace: true });
  };

  const folders = useQuery({
    queryKey: ["folders"],
    queryFn: api.listFolders,
    enabled: !!folderId,
  });
  const folderName = folderId
    ? folders.data?.find((f) => f.id === folderId)?.name ?? null
    : null;

  const tagsQ = useQuery({ queryKey: ["tags"], queryFn: api.listTags });
  const allTags = tagsQ.data ?? [];

  const r = useQuery({
    queryKey: ["search", q, folderId, view.sort, view.since, favorite, tagIds],
    queryFn: () =>
      api.search(q, {
        folderId: folderId ?? null,
        sort: view.sort,
        since: view.since,
        favorite,
        tagIds,
      }),
    enabled: q.length > 0,
  });

  const tagCandidates = useMemo<TagCandidate[]>(() => {
    const counts = new Map<string, number>();
    for (const { bookmark } of r.data ?? []) {
      for (const id of bookmark.tagIds) {
        if (!tagIds.includes(id)) counts.set(id, (counts.get(id) ?? 0) + 1);
      }
    }
    return (tagsQ.data ?? [])
      .filter((tag) => counts.has(tag.id))
      .map((tag) => ({ tag, count: counts.get(tag.id)! }));
  }, [r.data, tagsQ.data, tagIds]);

  const setView = (next: ResultView) =>
    setParams((prev) => writeView(prev, next), { replace: true });
  const setParam = (key: string, value: string | null) =>
    setParams(
      (prev) => {
        const next = new URLSearchParams(prev);
        if (value) next.set(key, value);
        else next.delete(key);
        return next;
      },
      { replace: true },
    );

  const removeScope = () => {
    const next = new URLSearchParams(params);
    next.delete("folderId");
    nav(`/search?${next.toString()}`, { replace: true });
  };

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center gap-2">
        <button
          type="button"
          onClick={goBack}
          title={t("search.back")}
          className="flex items-center gap-1 rounded p-1 text-slate-500 hover:bg-slate-100 hover:text-slate-900 dark:hover:bg-slate-800 dark:hover:text-slate-100"
        >
          <ArrowLeft className="h-4 w-4" />
          <span className="text-sm">{t("search.back")}</span>
        </button>
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
      {q && (
        <ResultControls
          view={view}
          onChange={setView}
          defaultSortLabel={t("results.sort.relevance")}
          showType={false}
          favorite={favorite}
          onFavoriteChange={(on) => setParam("fav", on ? "1" : null)}
        />
      )}
      {q && (tagIds.length > 0 || tagCandidates.length > 0) && (
        <FolderTagFilter
          selected={tagIds
            .map((id) => allTags.find((tag) => tag.id === id))
            .filter((tag): tag is NonNullable<typeof tag> => !!tag)}
          candidates={tagCandidates}
          onChange={(ids) => setParam("tags", ids.join(",") || null)}
          resultFolders={0}
          resultBookmarks={r.data?.length ?? 0}
          placeholder={t("results.tagPlaceholder")}
          summary={t("results.tagSummary", { count: r.data?.length ?? 0 })}
        />
      )}
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
            {bookmark.tagIds.length > 0 && (
              <div className="mt-1">
                <TagChipList tagIds={bookmark.tagIds} allTags={allTags} size="sm" />
              </div>
            )}
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
