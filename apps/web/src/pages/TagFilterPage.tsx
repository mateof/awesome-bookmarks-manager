import type { SmartQuery } from "@awesome-bookmarks/shared";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  Bookmark as BookmarkIcon,
  ExternalLink,
  Filter,
  FolderClosed,
  Save,
  Search,
  Star,
  Trash2,
  X,
} from "lucide-react";
import { useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import { Link, Navigate, useParams, useSearchParams } from "react-router-dom";
import { api } from "../api.js";
import { Modal } from "../components/Modal.js";
import { TagChipList } from "../components/TagChip.js";
import {
  filterUrl,
  isEmptyQuery,
  paramsFromQuery,
  queryFromParams,
  sameQuery,
} from "../lib/smartQuery.js";

/**
 * Filter folders and bookmarks by tags, free text and favourites.
 *
 * The whole selection lives in the query string (`?tags=a,b&m=all&q=…&fav=1`),
 * which is what makes a filter shareable, bookmarkable and survivable across
 * the back button. It is also exactly what a smart folder stores, so "save
 * this filter" is a rename away rather than a second implementation.
 *
 * When `?sf=<id>` is present the page is showing a saved smart folder, and the
 * header offers to update it once the query drifts from what was saved.
 */
export function TagFilterPage() {
  const { t } = useTranslation();
  const qc = useQueryClient();
  const [sp, setSp] = useSearchParams();

  const tagsQ = useQuery({ queryKey: ["tags"], queryFn: api.listTags });
  const foldersQ = useQuery({ queryKey: ["folders"], queryFn: api.listFolders });
  const bookmarksQ = useQuery({
    queryKey: ["bookmarks", "all"],
    queryFn: () => api.listBookmarks({}),
  });
  const smartQ = useQuery({
    queryKey: ["smart-folders"],
    queryFn: api.listSmartFolders,
  });

  const query = useMemo(() => queryFromParams(sp), [sp]);
  const selected = query.tagIds;
  const matchAll = query.match === "all";
  const smartId = sp.get("sf");
  const smart = smartQ.data?.find((s) => s.id === smartId) ?? null;
  const drifted = smart ? !sameQuery(smart.query, query) : false;

  /** Rewrite the URL from a whole query, preserving the open smart folder. */
  const apply = (next: SmartQuery, opts: { replace?: boolean } = {}) => {
    const params = paramsFromQuery(next);
    if (smartId) params.set("sf", smartId);
    setSp(params, { replace: opts.replace ?? false });
  };

  const toggle = (id: string) =>
    apply({
      ...query,
      tagIds: selected.includes(id)
        ? selected.filter((x) => x !== id)
        : [...selected, id],
    });

  const folders = foldersQ.data ?? [];
  const bookmarks = bookmarksQ.data ?? [];
  const allTags = tagsQ.data ?? [];
  const empty = isEmptyQuery(query);

  const needle = query.text.trim().toLowerCase();

  /** AND keeps items carrying every selected tag; OR keeps any match. */
  const tagHit = (tagIds: string[] | undefined) => {
    if (selected.length === 0) return true;
    const own = new Set(tagIds ?? []);
    return matchAll
      ? selected.every((id) => own.has(id))
      : selected.some((id) => own.has(id));
  };

  const matchingFolders = empty
    ? []
    : folders.filter(
        (f) =>
          tagHit(f.tagIds) &&
          (!query.favorite || f.favorite) &&
          (!needle || f.name.toLowerCase().includes(needle)),
      );
  const matchingBookmarks = empty
    ? []
    : bookmarks.filter(
        (b) =>
          tagHit(b.tagIds) &&
          (!query.favorite || b.favorite) &&
          (!needle ||
            b.title.toLowerCase().includes(needle) ||
            b.url.toLowerCase().includes(needle) ||
            (b.description?.toLowerCase().includes(needle) ?? false)),
      );

  // How many items each tag would bring on its own — useful to spot the tags
  // worth combining, and to hide tags nothing uses.
  const counts = useMemo(() => {
    const map = new Map<string, number>();
    for (const f of folders) for (const id of f.tagIds ?? []) map.set(id, (map.get(id) ?? 0) + 1);
    for (const b of bookmarks) for (const id of b.tagIds ?? []) map.set(id, (map.get(id) ?? 0) + 1);
    return map;
  }, [folders, bookmarks]);

  const [tagQuery, setTagQuery] = useState("");
  const [saving, setSaving] = useState(false);

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

  const updateSmart = useMutation({
    mutationFn: () =>
      api.updateSmartFolder(smartId!, { query }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["smart-folders"] }),
  });

  const removeSmart = useMutation({
    mutationFn: () => api.deleteSmartFolder(smartId!),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["smart-folders"] });
      const params = paramsFromQuery(query);
      setSp(params, { replace: true });
    },
  });

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-2">
        <Filter className="h-5 w-5 text-slate-400" />
        <h1 className="text-xl font-semibold">
          {smart ? smart.name : t("tags.filterHeading")}
        </h1>
        {smart && (
          <span
            className="h-2.5 w-2.5 shrink-0 rounded-full"
            style={{ background: smart.color }}
            aria-hidden
          />
        )}
        {!empty && (
          <span className="text-xs text-slate-500">
            {t("tags.filterSummary", {
              folders: matchingFolders.length,
              bookmarks: matchingBookmarks.length,
            })}
          </span>
        )}

        <div className="ml-auto flex flex-wrap items-center gap-1.5">
          {smart && drifted && (
            <button
              type="button"
              onClick={() => updateSmart.mutate()}
              disabled={updateSmart.isPending}
              className="rounded border border-slate-300 px-2.5 py-1 text-xs hover:bg-slate-100 disabled:opacity-50 dark:border-slate-700 dark:hover:bg-slate-800"
            >
              {t("smart.updateSaved")}
            </button>
          )}
          {smart && (
            <button
              type="button"
              onClick={() => {
                if (confirm(t("smart.confirmDelete", { name: smart.name }))) {
                  removeSmart.mutate();
                }
              }}
              title={t("smart.delete")}
              aria-label={t("smart.delete")}
              className="rounded border border-slate-300 p-1.5 text-slate-500 hover:bg-slate-100 hover:text-red-600 dark:border-slate-700 dark:hover:bg-slate-800"
            >
              <Trash2 className="h-3.5 w-3.5" />
            </button>
          )}
          {!empty && (
            <button
              type="button"
              onClick={() => setSaving(true)}
              className="flex items-center gap-1 rounded bg-slate-900 px-2.5 py-1 text-xs text-white dark:bg-slate-100 dark:text-slate-900"
            >
              <Save className="h-3.5 w-3.5" /> {t("smart.saveAs")}
            </button>
          )}
        </div>
      </div>

      {/* Query builder: text, favourites, tags, match mode */}
      <div className="space-y-2 rounded-lg border border-slate-200 p-2 dark:border-slate-800">
        <div className="flex flex-wrap items-center gap-1.5">
          <div className="flex min-w-[12rem] flex-1 items-center gap-1.5 rounded border border-slate-300 px-2 py-1 dark:border-slate-600">
            <Search className="h-3.5 w-3.5 shrink-0 text-slate-400" />
            <input
              value={query.text}
              onChange={(e) => apply({ ...query, text: e.target.value }, { replace: true })}
              placeholder={t("smart.textPlaceholder")}
              aria-label={t("smart.textPlaceholder")}
              className="min-w-0 flex-1 bg-transparent text-sm outline-none"
            />
            {query.text && (
              <button
                type="button"
                onClick={() => apply({ ...query, text: "" }, { replace: true })}
                title={t("common.remove")}
                aria-label={t("common.remove")}
                className="text-slate-400 hover:text-slate-700 dark:hover:text-slate-200"
              >
                <X className="h-3.5 w-3.5" />
              </button>
            )}
          </div>
          <button
            type="button"
            aria-pressed={query.favorite}
            onClick={() => apply({ ...query, favorite: !query.favorite })}
            className={`flex shrink-0 items-center gap-1 rounded-full border px-2.5 py-1 text-xs ${
              query.favorite
                ? "border-amber-400 bg-amber-100 text-amber-800 dark:border-amber-600 dark:bg-amber-900/40 dark:text-amber-300"
                : "border-slate-300 text-slate-600 hover:bg-slate-100 dark:border-slate-700 dark:text-slate-300 dark:hover:bg-slate-800"
            }`}
          >
            <Star
              className={`h-3 w-3 ${query.favorite ? "fill-amber-500 text-amber-500" : ""}`}
            />
            {t("smart.onlyFavorites")}
          </button>
        </div>

        <div className="flex items-center gap-1.5">
          <div className="flex min-w-0 flex-1 items-center gap-1.5 rounded border border-slate-300 px-2 py-1 dark:border-slate-600">
            <Search className="h-3.5 w-3.5 shrink-0 text-slate-400" />
            <input
              value={tagQuery}
              onChange={(e) => setTagQuery(e.target.value)}
              placeholder={t("tags.searchTags")}
              aria-label={t("tags.searchTags")}
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
              data-testid="tag-chip"
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
              onClick={() => apply({ ...query, match: "all" })}
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
              onClick={() => apply({ ...query, match: "any" })}
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
        {!empty && (
          <button
            type="button"
            onClick={() =>
              apply({ tagIds: [], match: "any", text: "", favorite: false })
            }
            className="inline-flex items-center gap-0.5 text-xs text-slate-500 hover:text-red-600"
          >
            <X className="h-3 w-3" /> {t("tags.clearFilter")}
          </button>
        )}
        </div>
      </div>

      {empty && <p className="text-sm text-slate-400">{t("tags.pickToFilter")}</p>}

      {!empty &&
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
                    src={api.folderIconUrl(f.aliasOf ?? f.id, f.updatedAt)}
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
                    src={api.bookmarkIconUrl(b.aliasOf ?? b.id, b.updatedAt)}
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

      {saving && (
        <SaveSmartFolderDialog
          query={query}
          suggestion={suggestName(query, allTags, t("smart.defaultName"))}
          onClose={() => setSaving(false)}
          onSaved={(id) => {
            setSaving(false);
            const params = paramsFromQuery(query);
            params.set("sf", id);
            setSp(params, { replace: true });
          }}
        />
      )}
    </div>
  );
}

/** A name the user will usually accept: the tags they picked, or the text. */
function suggestName(
  query: SmartQuery,
  allTags: Array<{ id: string; name: string }>,
  fallback: string,
): string {
  const names = query.tagIds
    .map((id) => allTags.find((tg) => tg.id === id)?.name)
    .filter(Boolean) as string[];
  if (names.length > 0) return names.slice(0, 3).join(query.match === "all" ? " + " : " / ");
  if (query.text.trim()) return query.text.trim();
  return fallback;
}

const SWATCHES = [
  "#6366f1",
  "#0ea5e9",
  "#10b981",
  "#f59e0b",
  "#ef4444",
  "#ec4899",
  "#8b5cf6",
  "#64748b",
];

function SaveSmartFolderDialog({
  query,
  suggestion,
  onClose,
  onSaved,
}: {
  query: SmartQuery;
  suggestion: string;
  onClose: () => void;
  onSaved: (id: string) => void;
}) {
  const { t } = useTranslation();
  const qc = useQueryClient();
  const [name, setName] = useState(suggestion);
  const [color, setColor] = useState(SWATCHES[0]!);
  const [err, setErr] = useState<string | null>(null);

  const save = useMutation({
    mutationFn: () =>
      api.createSmartFolder({ name: name.trim(), query, color }),
    onSuccess: (sf) => {
      qc.invalidateQueries({ queryKey: ["smart-folders"] });
      onSaved(sf.id);
    },
    onError: (e) => setErr(e instanceof Error ? e.message : t("common.error")),
  });

  return (
    <Modal title={t("smart.saveTitle")} onClose={onClose}>
      <div className="space-y-3">
        <label className="block text-xs font-medium text-slate-500">
          {t("smart.nameLabel")}
          <input
            autoFocus
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder={t("smart.namePlaceholder")}
            className="mt-1 w-full rounded border border-slate-300 bg-white px-3 py-2 text-sm text-slate-900 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-100"
          />
        </label>
        <div>
          <span className="text-xs font-medium text-slate-500">
            {t("smart.colorLabel")}
          </span>
          <div className="mt-1 flex flex-wrap gap-1.5">
            {SWATCHES.map((c) => (
              <button
                key={c}
                type="button"
                aria-label={c}
                aria-pressed={color === c}
                onClick={() => setColor(c)}
                className={`h-6 w-6 rounded-full border-2 ${
                  color === c ? "border-slate-900 dark:border-slate-100" : "border-transparent"
                }`}
                style={{ background: c }}
              />
            ))}
          </div>
        </div>
        <p className="flex items-start gap-1.5 text-xs text-slate-500">
          <BookmarkIcon className="mt-0.5 h-3.5 w-3.5 shrink-0" />
          {t("smart.liveNote")}
        </p>
        {err && (
          <div className="rounded bg-red-50 p-2 text-sm text-red-700 dark:bg-red-950 dark:text-red-300">
            {err}
          </div>
        )}
        <button
          type="button"
          disabled={!name.trim() || save.isPending}
          onClick={() => save.mutate()}
          className="w-full rounded bg-slate-900 py-2 text-white disabled:opacity-50 dark:bg-slate-100 dark:text-slate-900"
        >
          {save.isPending ? t("common.saving") : t("common.create")}
        </button>
      </div>
    </Modal>
  );
}

/** Old single-tag links (`/tag/:id`) keep working: send them to the filter. */
export function TagRedirectPage() {
  const { id } = useParams<{ id: string }>();
  return <Navigate to={`/filter?tags=${encodeURIComponent(id ?? "")}`} replace />;
}

/**
 * `/smart/:id` resolves a saved folder to the filter URL it stands for, so the
 * filter page stays the single renderer and the saved query is a shortcut
 * rather than a parallel implementation.
 */
export function SmartFolderPage() {
  const { id } = useParams<{ id: string }>();
  const q = useQuery({
    queryKey: ["smart-folders"],
    queryFn: api.listSmartFolders,
  });
  const { t } = useTranslation();
  const sf = q.data?.find((s) => s.id === id);

  if (q.isLoading) return <p className="text-sm text-slate-400">{t("common.loading")}</p>;
  if (!sf) return <Navigate to="/filter" replace />;
  return <Navigate to={filterUrl(sf.query, sf.id)} replace />;
}
