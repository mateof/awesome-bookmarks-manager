import type { Bookmark, DuplicateGroup, Tag } from "@awesome-bookmarks/shared";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Copy, Info, Merge, Star, X } from "lucide-react";
import { useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import { Link } from "react-router-dom";
import { api } from "../api.js";
import { LetterIcon } from "../components/LetterIcon.js";
import { TagChipList } from "../components/TagChip.js";
import { buildFolderPath } from "../hooks.js";
import { fmtDate } from "../lib/date.js";

/**
 * Bookmarks that point at the same URL, grouped so they can be folded into
 * one. Duplicates mostly arrive in bulk from a browser import, which is why
 * merging keeps every tag and description rather than picking a winner and
 * discarding the rest: the copies usually differ in exactly the metadata you
 * would not want to lose.
 *
 * Merged rows go to the trash, not to /dev/null, so a merge is undoable.
 */
export function DuplicatesPage() {
  const { t } = useTranslation();
  const qc = useQueryClient();
  const [msg, setMsg] = useState<string | null>(null);
  const [err, setErr] = useState<string | null>(null);
  /** Chosen keeper per group; defaults to the oldest (first) member. */
  const [keepers, setKeepers] = useState<Record<string, string>>({});

  const dupes = useQuery({
    queryKey: ["duplicates"],
    queryFn: api.listDuplicates,
  });
  const folders = useQuery({ queryKey: ["folders"], queryFn: api.listFolders });
  const tags = useQuery({ queryKey: ["tags"], queryFn: api.listTags });

  const pathOf = useMemo(() => {
    const list = folders.data ?? [];
    return (folderId: string | null) => {
      if (!folderId) return t("sidebar.home");
      const path = buildFolderPath(list, folderId).map((f) => f.name);
      return path.length ? path.join(" / ") : t("sidebar.home");
    };
  }, [folders.data, t]);

  const merge = useMutation({
    mutationFn: ({ keepId, mergeIds }: { keepId: string; mergeIds: string[] }) =>
      api.mergeBookmarks(keepId, mergeIds),
    onSuccess: (res) => {
      setErr(null);
      setMsg(
        t("duplicates.merged", {
          count: res.merged,
          tags: res.tagsAdded,
        }),
      );
      qc.invalidateQueries({ queryKey: ["duplicates"] });
      qc.invalidateQueries({ queryKey: ["bookmarks"] });
      qc.invalidateQueries({ queryKey: ["trash"] });
    },
    onError: (e) => setErr(e instanceof Error ? e.message : t("common.error")),
  });

  const mergeAll = useMutation({
    mutationFn: async (groups: DuplicateGroup[]) => {
      let merged = 0;
      for (const g of groups) {
        const keepId = keepers[g.key] ?? g.bookmarks[0]!.id;
        const mergeIds = g.bookmarks.filter((b) => b.id !== keepId).map((b) => b.id);
        if (mergeIds.length === 0) continue;
        await api.mergeBookmarks(keepId, mergeIds);
        merged += mergeIds.length;
      }
      return merged;
    },
    onSuccess: (merged) => {
      setErr(null);
      setMsg(t("duplicates.mergedAll", { count: merged }));
      qc.invalidateQueries({ queryKey: ["duplicates"] });
      qc.invalidateQueries({ queryKey: ["bookmarks"] });
      qc.invalidateQueries({ queryKey: ["trash"] });
    },
    onError: (e) => setErr(e instanceof Error ? e.message : t("common.error")),
  });

  const groups = dupes.data ?? [];
  const totalExtra = groups.reduce((n, g) => n + g.bookmarks.length - 1, 0);
  const busy = merge.isPending || mergeAll.isPending;

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-2">
        <Copy className="h-5 w-5 text-slate-400" />
        <h1 className="text-xl font-semibold">{t("duplicates.title")}</h1>
        {groups.length > 0 && (
          <span className="text-xs text-slate-500">
            {t("duplicates.summary", {
              groups: groups.length,
              extra: totalExtra,
            })}
          </span>
        )}
        {groups.length > 0 && (
          <button
            type="button"
            disabled={busy}
            onClick={() => {
              if (confirm(t("duplicates.confirmMergeAll", { count: totalExtra }))) {
                mergeAll.mutate(groups);
              }
            }}
            className="ml-auto rounded bg-slate-900 px-3 py-1.5 text-xs text-white disabled:opacity-50 dark:bg-slate-100 dark:text-slate-900"
          >
            {mergeAll.isPending ? t("common.saving") : t("duplicates.mergeAll")}
          </button>
        )}
      </div>

      <p className="flex items-start gap-2 rounded border border-slate-200 bg-slate-50 p-2 text-xs text-slate-500 dark:border-slate-800 dark:bg-slate-900">
        <Info className="mt-0.5 h-3.5 w-3.5 shrink-0" />
        {t("duplicates.explainer")}
      </p>

      {msg && (
        <div className="flex items-center gap-2 rounded bg-green-50 p-2 text-sm text-green-800 dark:bg-green-950 dark:text-green-300">
          <span className="flex-1">{msg}</span>
          <button type="button" onClick={() => setMsg(null)} aria-label={t("common.close")}>
            <X className="h-3.5 w-3.5" />
          </button>
        </div>
      )}
      {err && (
        <div className="rounded bg-red-50 p-2 text-sm text-red-700 dark:bg-red-950 dark:text-red-300">
          {err}
        </div>
      )}

      {dupes.isLoading && (
        <p className="text-sm text-slate-400">{t("common.loading")}</p>
      )}
      {!dupes.isLoading && groups.length === 0 && (
        <p className="text-sm text-slate-400">{t("duplicates.none")}</p>
      )}

      <div className="space-y-3">
        {groups.map((g) => {
          const keepId = keepers[g.key] ?? g.bookmarks[0]!.id;
          const mergeIds = g.bookmarks
            .filter((b) => b.id !== keepId)
            .map((b) => b.id);
          return (
            <section
              key={g.key}
              data-testid="duplicate-group"
              className="rounded border border-slate-200 bg-white p-3 dark:border-slate-800 dark:bg-slate-900"
            >
              <div className="mb-2 flex flex-wrap items-center gap-2">
                <a
                  href={g.url}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="min-w-0 flex-1 truncate text-sm font-medium hover:underline"
                >
                  {g.url}
                </a>
                <span className="shrink-0 rounded-full bg-amber-100 px-2 py-0.5 text-xs font-medium text-amber-800 dark:bg-amber-900/40 dark:text-amber-300">
                  {t("duplicates.copies", { count: g.bookmarks.length })}
                </span>
                <button
                  type="button"
                  disabled={busy || mergeIds.length === 0}
                  onClick={() => merge.mutate({ keepId, mergeIds })}
                  className="flex shrink-0 items-center gap-1 rounded bg-slate-900 px-2.5 py-1 text-xs text-white disabled:opacity-50 dark:bg-slate-100 dark:text-slate-900"
                >
                  <Merge className="h-3.5 w-3.5" />
                  {t("duplicates.mergeGroup", { count: mergeIds.length })}
                </button>
              </div>

              <ul className="space-y-1">
                {g.bookmarks.map((b) => (
                  <Row
                    key={b.id}
                    bookmark={b}
                    keep={b.id === keepId}
                    onKeep={() => setKeepers((p) => ({ ...p, [g.key]: b.id }))}
                    path={pathOf(b.folderId)}
                    allTags={tags.data ?? []}
                    groupKey={g.key}
                  />
                ))}
              </ul>
            </section>
          );
        })}
      </div>
    </div>
  );
}

function Row({
  bookmark,
  keep,
  onKeep,
  path,
  allTags,
  groupKey,
}: {
  bookmark: Bookmark;
  keep: boolean;
  onKeep: () => void;
  path: string;
  allTags: Tag[];
  groupKey: string;
}) {
  const { t } = useTranslation();
  return (
    <li
      className={`flex items-start gap-2 rounded border p-2 ${
        keep
          ? "border-green-400 bg-green-50/60 dark:border-green-700 dark:bg-green-950/30"
          : "border-slate-200 dark:border-slate-800"
      }`}
    >
      <input
        type="radio"
        name={`keep-${groupKey}`}
        checked={keep}
        onChange={onKeep}
        aria-label={t("duplicates.keepThis")}
        className="mt-1 shrink-0"
      />
      {bookmark.iconBlobPath ? (
        <img
          src={api.bookmarkIconUrl(bookmark.aliasOf ?? bookmark.id, bookmark.updatedAt)}
          alt=""
          className="mt-0.5 h-5 w-5 shrink-0 rounded object-cover"
        />
      ) : (
        <LetterIcon
          label={bookmark.title || bookmark.url}
          seed={bookmark.url}
          size="h-5 w-5"
        />
      )}
      <div className="min-w-0 flex-1">
        <div className="flex items-center gap-1">
          <Link
            to={`/bookmark/${bookmark.id}`}
            className="min-w-0 truncate text-sm font-medium hover:underline"
          >
            {bookmark.title}
          </Link>
          {bookmark.favorite && (
            <Star className="h-3 w-3 shrink-0 fill-amber-400 text-amber-400" />
          )}
        </div>
        <div className="truncate text-xs text-slate-500">
          {path} · {fmtDate(bookmark.createdAt)}
        </div>
        {bookmark.tagIds.length > 0 && (
          <div className="mt-1">
            <TagChipList tagIds={bookmark.tagIds} allTags={allTags} size="sm" />
          </div>
        )}
      </div>
      {keep && (
        <span className="shrink-0 rounded-full bg-green-600 px-2 py-0.5 text-[10px] font-medium uppercase text-white">
          {t("duplicates.keeps")}
        </span>
      )}
    </li>
  );
}
