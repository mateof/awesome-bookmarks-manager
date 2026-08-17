import { useQuery } from "@tanstack/react-query";
import { ExternalLink, Filter, FolderClosed, Search, X } from "lucide-react";
import { useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import { Link, Navigate, useParams, useSearchParams } from "react-router-dom";
import { api } from "../api.js";
import { TagChipList } from "../components/TagChip.js";

/**
 * Filter folders and bookmarks by one or more tags.
 *
 * The selection lives in the query string (`?tags=a,b&m=all`) so a filter is
 * shareable, bookmarkable and survives the back button. The chip bar and the
 * "match all / match any" toggle mirror the public panel's tag filter on
 * purpose: same interaction in both places, nothing new to learn.
 *
 * Everything is filtered client-side over the already-loaded lists, which is
 * what the single-tag version did too.
 */
export function TagFilterPage() {
  const { t } = useTranslation();
  const [sp, setSp] = useSearchParams();

  const tagsQ = useQuery({ queryKey: ["tags"], queryFn: api.listTags });
  const foldersQ = useQuery({ queryKey: ["folders"], queryFn: api.listFolders });
  const bookmarksQ = useQuery({
    queryKey: ["bookmarks", "all"],
    queryFn: () => api.listBookmarks({}),
  });

  const selected = useMemo(
    () => (sp.get("tags") ?? "").split(",").filter(Boolean),
    [sp],
  );
  const matchAll = sp.get("m") === "all";

  const setSelected = (ids: string[]) =>
    setSp(
      (prev) => {
        const n = new URLSearchParams(prev);
        if (ids.length) n.set("tags", ids.join(","));
        else n.delete("tags");
        // A single tag makes the mode meaningless; drop it to keep URLs clean.
        if (ids.length < 2) n.delete("m");
        return n;
      },
      { replace: false },
    );

  const toggle = (id: string) =>
    setSelected(
      selected.includes(id)
        ? selected.filter((x) => x !== id)
        : [...selected, id],
    );

  const setMatchAll = (on: boolean) =>
    setSp(
      (prev) => {
        const n = new URLSearchParams(prev);
        if (on) n.set("m", "all");
        else n.delete("m");
        return n;
      },
      { replace: true },
    );

  const folders = foldersQ.data ?? [];
  const bookmarks = bookmarksQ.data ?? [];
  const allTags = tagsQ.data ?? [];

  /** AND keeps items carrying every selected tag; OR keeps any match. */
  const hits = (tagIds: string[] | undefined) => {
    const own = new Set(tagIds ?? []);
    if (selected.length === 0) return false;
    return matchAll
      ? selected.every((id) => own.has(id))
      : selected.some((id) => own.has(id));
  };

  const matchingFolders = selected.length ? folders.filter((f) => hits(f.tagIds)) : [];
  const matchingBookmarks = selected.length
    ? bookmarks.filter((b) => hits(b.tagIds))
    : [];

  // How many items each tag would bring on its own — useful to spot the tags
  // worth combining, and to hide tags nothing uses.
  const counts = useMemo(() => {
    const map = new Map<string, number>();
    for (const f of folders) for (const id of f.tagIds ?? []) map.set(id, (map.get(id) ?? 0) + 1);
    for (const b of bookmarks) for (const id of b.tagIds ?? []) map.set(id, (map.get(id) ?? 0) + 1);
    return map;
  }, [folders, bookmarks]);

  const [tagQuery, setTagQuery] = useState("");

  /** Accent- and case-insensitive, so "diseno" finds "diseño". */
  const norm = (v: string) =>
    v.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase();

  const usableTags = useMemo(() => {
    const q = norm(tagQuery.trim());
    return allTags
      .filter((tg) => (counts.get(tg.id) ?? 0) > 0 || selected.includes(tg.id))
      // A selected tag stays visible even when the search would hide it, so the
      // active filter never disappears from view while you look for the next one.
      .filter((tg) => !q || selected.includes(tg.id) || norm(tg.name).includes(q))
      .sort((a, b) => {
        const aSel = selected.includes(a.id) ? 0 : 1;
        const bSel = selected.includes(b.id) ? 0 : 1;
        if (aSel !== bSel) return aSel - bSel;
        // Then the most used first: with hundreds of tags the common ones
        // should be reachable without typing.
        const diff = (counts.get(b.id) ?? 0) - (counts.get(a.id) ?? 0);
        return diff !== 0 ? diff : a.name.localeCompare(b.name);
      });
  }, [allTags, counts, selected, tagQuery]);

  const hiddenByQuery =
    allTags.filter((tg) => (counts.get(tg.id) ?? 0) > 0).length -
    usableTags.filter((tg) => (counts.get(tg.id) ?? 0) > 0).length;

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-2">
        <Filter className="h-5 w-5 text-slate-400" />
        <h1 className="text-xl font-semibold">{t("tags.filterHeading")}</h1>
        {selected.length > 0 && (
          <span className="text-xs text-slate-500">
            {t("tags.filterSummary", {
              folders: matchingFolders.length,
              bookmarks: matchingBookmarks.length,
            })}
          </span>
        )}
      </div>

      {/* Tag picker + match mode */}
      <div className="space-y-2 rounded-lg border border-slate-200 p-2 dark:border-slate-800">
        <div className="flex items-center gap-1.5">
          <div className="flex min-w-0 flex-1 items-center gap-1.5 rounded border border-slate-300 px-2 py-1 dark:border-slate-600">
            <Search className="h-3.5 w-3.5 shrink-0 text-slate-400" />
            <input
              value={tagQuery}
              onChange={(e) => setTagQuery(e.target.value)}
              placeholder={t("tags.searchTags")}
              className="min-w-0 flex-1 bg-transparent text-sm outline-none"
            />
            {tagQuery && (
              <button
                type="button"
                onClick={() => setTagQuery("")}
                title={t("common.remove")}
                aria-label={t("common.remove")}
                className="text-slate-400 hover:text-slate-700 dark:hover:text-slate-200"
              >
                <X className="h-3.5 w-3.5" />
              </button>
            )}
          </div>
          {hiddenByQuery > 0 && (
            <span className="shrink-0 text-xs text-slate-400">
              {t("tags.hiddenBySearch", { count: hiddenByQuery })}
            </span>
          )}
        </div>

        <div className="flex max-h-40 flex-wrap items-center gap-1.5 overflow-y-auto">
        {usableTags.length === 0 && (
          <span className="px-1 text-sm text-slate-400">
            {tagQuery ? t("tags.noTagMatches") : t("tags.empty")}
          </span>
        )}
        {usableTags.map((tg) => {
          const on = selected.includes(tg.id);
          return (
            <button
              key={tg.id}
              type="button"
              aria-pressed={on}
              onClick={() => toggle(tg.id)}
              className="inline-flex items-center gap-1 rounded-full border px-2.5 py-0.5 text-xs font-medium transition"
              style={{
                background: on ? tg.color : `${tg.color}22`,
                color: on ? "#fff" : tg.color,
                borderColor: on ? tg.color : `${tg.color}55`,
              }}
            >
              {tg.name}
              <span className="opacity-70">{counts.get(tg.id) ?? 0}</span>
            </button>
          );
        })}

        </div>

        <div className="flex flex-wrap items-center gap-1.5">
        {selected.length > 1 && (
          <div className="mr-auto flex items-center gap-1">
            <button
              type="button"
              onClick={() => setMatchAll(true)}
              className={`rounded-full border px-2.5 py-0.5 text-xs ${
                matchAll
                  ? "border-slate-900 bg-slate-900 text-white dark:border-slate-100 dark:bg-slate-100 dark:text-slate-900"
                  : "border-slate-300 text-slate-600 dark:border-slate-700 dark:text-slate-300"
              }`}
              title={t("tags.matchAllHint")}
            >
              {t("tags.matchAll")}
            </button>
            <button
              type="button"
              onClick={() => setMatchAll(false)}
              className={`rounded-full border px-2.5 py-0.5 text-xs ${
                !matchAll
                  ? "border-slate-900 bg-slate-900 text-white dark:border-slate-100 dark:bg-slate-100 dark:text-slate-900"
                  : "border-slate-300 text-slate-600 dark:border-slate-700 dark:text-slate-300"
              }`}
              title={t("tags.matchAnyHint")}
            >
              {t("tags.matchAny")}
            </button>
          </div>
        )}
        {selected.length > 0 && (
          <button
            type="button"
            onClick={() => setSelected([])}
            className="inline-flex items-center gap-0.5 text-xs text-slate-500 hover:text-red-600"
          >
            <X className="h-3 w-3" /> {t("tags.clearFilter")}
          </button>
        )}
        </div>
      </div>

      {selected.length === 0 && (
        <p className="text-sm text-slate-400">{t("tags.pickToFilter")}</p>
      )}

      {selected.length > 0 &&
        matchingFolders.length === 0 &&
        matchingBookmarks.length === 0 && (
          <p className="text-sm text-slate-400">{t("tags.filterEmpty")}</p>
        )}

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
                    src={api.folderIconUrl(f.id, f.updatedAt)}
                    alt=""
                    className="h-6 w-6 rounded object-cover"
                  />
                ) : (
                  <FolderClosed className="h-6 w-6 text-slate-500" />
                )}
                <div className="flex flex-1 flex-col gap-1 overflow-hidden">
                  <span className="truncate text-sm font-medium">{f.name}</span>
                  <TagChipList tagIds={f.tagIds ?? []} allTags={allTags} size="sm" />
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
                    src={api.bookmarkIconUrl(b.id, b.updatedAt)}
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
                    <TagChipList tagIds={b.tagIds ?? []} allTags={allTags} size="sm" />
                  </div>
                </div>
              </div>
            ))}
          </div>
        </section>
      )}
    </div>
  );
}

/** Old single-tag links (`/tag/:id`) keep working: send them to the filter. */
export function TagRedirectPage() {
  const { id } = useParams<{ id: string }>();
  return <Navigate to={`/filter?tags=${encodeURIComponent(id ?? "")}`} replace />;
}
