import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  TAG_PALETTE,
  type Tag,
  pickTagColor,
} from "@awesome-bookmarks/shared";
import {
  Check,
  Filter,
  Merge,
  Pencil,
  Plus,
  Search,
  Trash2,
  X,
} from "lucide-react";
import { useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import { dlg } from "../components/dialogs.js";
import { Link } from "react-router-dom";
import { ApiError, api } from "../api.js";
import { Modal } from "../components/Modal.js";
import { foldText } from "../lib/emojiCatalog.js";

type SortBy = "name" | "most" | "least";

/** Uses of a tag, counted by the server and sent with the list. */
const uses = (tg: Tag) => (tg.folderCount ?? 0) + (tg.bookmarkCount ?? 0);

/**
 * The key two tags share when they are "the same tag typed twice".
 *
 * Ignores case and accents, and drops a trailing `s`, which is what an import
 * from another app actually leaves behind: `receta` next to `recetas`,
 * `Prensa` next to `prensa`. Deliberately crude — it only *proposes* a merge,
 * and a proposal that is sometimes wrong costs a glance, while a rule so
 * strict it proposes nothing costs the whole feature.
 */
function similarKey(name: string): string {
  const folded = foldText(name.trim());
  return folded.endsWith("s") ? folded.slice(0, -1) : folded;
}

export function TagsPage() {
  const { t } = useTranslation();
  const qc = useQueryClient();
  const tagsQ = useQuery({ queryKey: ["tags"], queryFn: api.listTags });

  const [showCreate, setShowCreate] = useState(false);
  const [editing, setEditing] = useState<Tag | null>(null);
  const [merging, setMerging] = useState<Tag | null>(null);
  const [query, setQuery] = useState("");
  const [sortBy, setSortBy] = useState<SortBy>("name");
  const [onlyUnused, setOnlyUnused] = useState(false);
  const [onlySimilar, setOnlySimilar] = useState(false);
  const [picked, setPicked] = useState<Set<string>>(new Set());

  const all = tagsQ.data ?? [];
  const unusedCount = all.filter((tg) => uses(tg) === 0).length;

  /** Names that appear more than once once case, accents and plurals are off. */
  const similar = useMemo(() => {
    const byKey = new Map<string, string[]>();
    for (const tg of all) {
      const k = similarKey(tg.name);
      byKey.set(k, [...(byKey.get(k) ?? []), tg.id]);
    }
    const out = new Set<string>();
    for (const ids of byKey.values()) {
      if (ids.length > 1) for (const id of ids) out.add(id);
    }
    return out;
  }, [all]);

  const tags = useMemo(() => {
    const needle = foldText(query.trim());
    const list = all.filter(
      (tg) =>
        (!needle || foldText(tg.name).includes(needle)) &&
        (!onlyUnused || uses(tg) === 0) &&
        (!onlySimilar || similar.has(tg.id)),
    );
    return list.sort((a, b) => {
      if (sortBy === "name") return a.name.localeCompare(b.name);
      const diff = uses(b) - uses(a);
      const byUse = sortBy === "most" ? diff : -diff;
      return byUse !== 0 ? byUse : a.name.localeCompare(b.name);
    });
  }, [all, query, sortBy, onlyUnused, onlySimilar, similar]);

  const del = useMutation({
    mutationFn: (ids: string[]) => api.deleteTags(ids),
    onSuccess: () => {
      setPicked(new Set());
      qc.invalidateQueries({ queryKey: ["tags"] });
      qc.invalidateQueries({ queryKey: ["folders"] });
      qc.invalidateQueries({ queryKey: ["bookmarks"] });
    },
  });

  const toggle = (id: string) =>
    setPicked((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });

  const removeMany = async (ids: string[], message: string) => {
    if (ids.length === 0) return;
    if (!(await dlg.confirm({ message, danger: true }))) return;
    del.mutate(ids);
  };

  return (
    <div className="space-y-4">
      <div className="flex items-center">
        <h1 className="text-xl font-semibold">{t("tags.pageTitle")}</h1>
        <Link
          to="/filter"
          className="ml-auto flex items-center gap-1 rounded border border-slate-300 px-3 py-1 text-sm hover:bg-slate-100 dark:border-slate-700 dark:hover:bg-slate-800"
        >
          <Filter className="h-4 w-4" /> {t("tags.filterHeading")}
        </Link>
        <button
          onClick={() => setShowCreate(true)}
          className="ml-2 flex items-center gap-1 rounded bg-slate-900 px-3 py-1 text-sm text-white dark:bg-slate-100 dark:text-slate-900"
        >
          <Plus className="h-4 w-4" /> {t("tags.newTag")}
        </button>
      </div>

      {all.length > 0 && (
        <div className="space-y-2">
          <div className="flex items-center gap-2 rounded border border-slate-300 px-2 py-1.5 dark:border-slate-700">
            <Search className="h-4 w-4 shrink-0 text-slate-400" />
            <input
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder={t("tags.searchTags")}
              aria-label={t("tags.searchTags")}
              className="min-w-0 flex-1 bg-transparent text-sm outline-none"
            />
            {/* How many are *not* on screen, the same way the filter page says
                it: with three hundred tags, a list that shows four should say
                what it left out. */}
            {all.length - tags.length > 0 && (
              <span className="shrink-0 text-xs text-slate-400">
                {t("tags.hiddenBySearch", { count: all.length - tags.length })}
              </span>
            )}
            {query !== "" && (
              <button
                type="button"
                onClick={() => setQuery("")}
                aria-label={t("common.remove")}
                title={t("common.remove")}
                className="shrink-0 rounded p-0.5 text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-800"
              >
                <X className="h-3.5 w-3.5" />
              </button>
            )}
          </div>

          <div className="flex flex-wrap items-center gap-2 text-sm">
            {/* Unused tags live only here: the filter page hides them, so this
                is the one screen where a library can be tidied at all. */}
            <button
              type="button"
              onClick={() => setOnlyUnused((v) => !v)}
              aria-pressed={onlyUnused}
              className={`rounded-full border px-3 py-1 text-xs ${
                onlyUnused
                  ? "border-slate-900 bg-slate-900 text-white dark:border-slate-100 dark:bg-slate-100 dark:text-slate-900"
                  : "border-slate-300 hover:bg-slate-100 dark:border-slate-700 dark:hover:bg-slate-800"
              }`}
            >
              {t("tags.onlyUnused", { count: unusedCount })}
            </button>
            {similar.size > 0 && (
              <button
                type="button"
                onClick={() => setOnlySimilar((v) => !v)}
                aria-pressed={onlySimilar}
                className={`rounded-full border px-3 py-1 text-xs ${
                  onlySimilar
                    ? "border-slate-900 bg-slate-900 text-white dark:border-slate-100 dark:bg-slate-100 dark:text-slate-900"
                    : "border-slate-300 hover:bg-slate-100 dark:border-slate-700 dark:hover:bg-slate-800"
                }`}
              >
                {t("tags.onlySimilar", { count: similar.size })}
              </button>
            )}
            <label className="ml-auto flex items-center gap-2 text-xs text-slate-500">
              {t("tags.sortLabel")}
              <select
                value={sortBy}
                onChange={(e) => setSortBy(e.target.value as SortBy)}
                aria-label={t("tags.sortLabel")}
                className="rounded border border-slate-300 bg-white px-2 py-1 text-xs dark:border-slate-700 dark:bg-slate-800"
              >
                <option value="name">{t("tags.sortName")}</option>
                <option value="most">{t("tags.sortMostUsed")}</option>
                <option value="least">{t("tags.sortLeastUsed")}</option>
              </select>
            </label>
          </div>
        </div>
      )}

      {picked.size > 0 && (
        <div className="flex flex-wrap items-center gap-2 rounded border border-slate-300 bg-white px-3 py-2 text-sm shadow-sm dark:border-slate-700 dark:bg-slate-900">
          <span className="font-medium">
            {t("tags.selectedCount", { count: picked.size })}
          </span>
          <button
            onClick={() =>
              removeMany(
                [...picked],
                t("tags.confirmDeleteMany", { count: picked.size }),
              )
            }
            className="flex items-center gap-1 rounded border border-red-300 px-3 py-1 text-red-600 hover:bg-red-50 dark:border-red-900 dark:hover:bg-red-950"
          >
            <Trash2 className="h-4 w-4" /> {t("tags.deleteSelected")}
          </button>
          <button
            onClick={() => setPicked(new Set())}
            className="ml-auto rounded px-2 py-1 text-xs text-slate-500 hover:bg-slate-100 dark:hover:bg-slate-800"
          >
            {t("folder.selectionCancel")}
          </button>
        </div>
      )}

      {tags.length === 0 && !tagsQ.isLoading && (
        <div className="rounded border border-dashed border-slate-300 p-6 text-center text-sm text-slate-400 dark:border-slate-700">
          {all.length === 0 ? t("tags.empty") : t("tags.noTagMatches")}
        </div>
      )}

      <div className="space-y-1">
        {tags.map((tg) => (
          <div
            key={tg.id}
            className="flex items-center gap-3 rounded border border-slate-200 bg-white p-2 dark:border-slate-800 dark:bg-slate-900"
          >
            <input
              type="checkbox"
              checked={picked.has(tg.id)}
              onChange={() => toggle(tg.id)}
              aria-label={tg.name}
              className="h-4 w-4 shrink-0 accent-slate-700"
            />
            <span
              className="h-4 w-4 shrink-0 rounded-full"
              style={{ background: tg.color }}
            />
            <Link
              to={`/tag/${tg.id}`}
              className="flex-1 truncate text-sm font-medium hover:underline"
            >
              {tg.name}
            </Link>
            {/* Split rather than one total: "12 bookmarks" and "12 folders"
                are different situations, and deciding whether a tag can go
                needs to know which. */}
            <span className="shrink-0 text-xs text-slate-500">
              {uses(tg) === 0
                ? t("tags.unused")
                : [
                    tg.folderCount
                      ? t("tags.usedInFolders", { count: tg.folderCount })
                      : "",
                    tg.bookmarkCount
                      ? t("tags.usedInBookmarks", { count: tg.bookmarkCount })
                      : "",
                  ]
                    .filter(Boolean)
                    .join(" · ")}
            </span>
            <button
              onClick={() => setMerging(tg)}
              title={t("tags.mergeAction")}
              aria-label={t("tags.mergeAction")}
              className="rounded p-1 text-slate-400 hover:bg-slate-100 hover:text-slate-900 dark:hover:bg-slate-800 dark:hover:text-slate-100"
            >
              <Merge className="h-4 w-4" />
            </button>
            <button
              onClick={() => setEditing(tg)}
              title={t("common.edit")}
              className="rounded p-1 text-slate-400 hover:bg-slate-100 hover:text-slate-900 dark:hover:bg-slate-800 dark:hover:text-slate-100"
            >
              <Pencil className="h-4 w-4" />
            </button>
            <button
              onClick={() =>
                removeMany(
                  [tg.id],
                  t("tags.confirmDelete", { name: tg.name, count: uses(tg) }),
                )
              }
              title={t("common.delete")}
              className="rounded p-1 text-slate-400 hover:bg-red-50 hover:text-red-600 dark:hover:bg-red-950"
            >
              <Trash2 className="h-4 w-4" />
            </button>
          </div>
        ))}
      </div>

      {showCreate && (
        <TagDialog
          existingTags={all}
          onClose={() => setShowCreate(false)}
          onSaved={() => qc.invalidateQueries({ queryKey: ["tags"] })}
        />
      )}
      {editing && (
        <TagDialog
          tag={editing}
          existingTags={all}
          onClose={() => setEditing(null)}
          onSaved={() => qc.invalidateQueries({ queryKey: ["tags"] })}
        />
      )}
      {merging && (
        <MergeDialog
          tag={merging}
          all={all}
          onClose={() => setMerging(null)}
          onDone={() => {
            qc.invalidateQueries({ queryKey: ["tags"] });
            qc.invalidateQueries({ queryKey: ["folders"] });
            qc.invalidateQueries({ queryKey: ["bookmarks"] });
            qc.invalidateQueries({ queryKey: ["smart-folders"] });
          }}
        />
      )}
    </div>
  );
}

/**
 * Choose the tag that survives.
 *
 * Worded around what disappears rather than what is chosen, because that is
 * the part that cannot be undone: the tag being folded away stops existing,
 * and everything wearing it ends up wearing the other one.
 */
function MergeDialog({
  tag,
  all,
  onClose,
  onDone,
}: {
  tag: Tag;
  all: Tag[];
  onClose: () => void;
  onDone: () => void;
}) {
  const { t } = useTranslation();
  const [query, setQuery] = useState("");
  const [err, setErr] = useState<string | null>(null);

  const options = useMemo(() => {
    const needle = foldText(query.trim());
    return all
      .filter((x) => x.id !== tag.id)
      .filter((x) => !needle || foldText(x.name).includes(needle))
      // The likely partner first: same name once case, accents and a trailing
      // plural are off, which is exactly what the merge exists for.
      .sort((a, b) => {
        const key = similarKey(tag.name);
        const as = similarKey(a.name) === key ? 0 : 1;
        const bs = similarKey(b.name) === key ? 0 : 1;
        return as - bs || a.name.localeCompare(b.name);
      })
      .slice(0, 50);
  }, [all, tag, query]);

  const m = useMutation({
    mutationFn: (into: string) => api.mergeTag(tag.id, into),
    onSuccess: () => {
      onDone();
      onClose();
    },
    onError: (e) =>
      setErr(e instanceof ApiError ? e.message : t("common.error")),
  });

  return (
    <Modal title={t("tags.mergeTitle", { name: tag.name })} onClose={onClose}>
      <div className="space-y-3" data-testid="tag-merge">
        <p className="text-sm text-slate-500">
          {t("tags.mergeExplain", { name: tag.name })}
        </p>
        <div className="flex items-center gap-2 rounded border border-slate-300 px-2 py-1.5 dark:border-slate-700">
          <Search className="h-4 w-4 shrink-0 text-slate-400" />
          <input
            autoFocus
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder={t("tags.mergeSearch")}
            aria-label={t("tags.mergeSearch")}
            className="min-w-0 flex-1 bg-transparent text-sm outline-none"
          />
        </div>
        <div className="max-h-72 space-y-1 overflow-y-auto">
          {options.map((x) => (
            <button
              key={x.id}
              type="button"
              disabled={m.isPending}
              onClick={() => m.mutate(x.id)}
              className="flex w-full items-center gap-2 rounded px-2 py-1.5 text-left text-sm hover:bg-slate-100 disabled:opacity-50 dark:hover:bg-slate-800"
            >
              <span
                className="h-3 w-3 shrink-0 rounded-full"
                style={{ background: x.color }}
              />
              <span className="min-w-0 flex-1 truncate">{x.name}</span>
              <span className="shrink-0 text-xs text-slate-400">
                {uses(x)}
              </span>
            </button>
          ))}
          {options.length === 0 && (
            <p className="px-2 py-4 text-center text-xs text-slate-400">
              {t("tags.noTagMatches")}
            </p>
          )}
        </div>
        {err && (
          <div className="rounded bg-red-50 p-2 text-sm text-red-700 dark:bg-red-950 dark:text-red-300">
            {err}
          </div>
        )}
      </div>
    </Modal>
  );
}

function TagDialog({
  tag,
  existingTags,
  onClose,
  onSaved,
}: {
  tag?: Tag;
  /** So a new tag can open on a colour none of them is using. */
  existingTags: Tag[];
  onClose: () => void;
  onSaved: () => void;
}) {
  const { t } = useTranslation();
  const isEdit = !!tag;
  const [name, setName] = useState(tag?.name ?? "");
  // A new tag opens on a colour nothing else is using, so the common case is
  // typing a name and pressing save.
  const [color, setColor] = useState(
    tag?.color ?? pickTagColor(existingTags),
  );
  const [err, setErr] = useState<string | null>(null);

  const m = useMutation({
    mutationFn: () =>
      isEdit
        ? api.updateTag(tag!.id, { name, color })
        : api.createTag({ name, color }),
    onSuccess: () => {
      onSaved();
      onClose();
    },
    onError: (e) =>
      setErr(e instanceof ApiError ? e.message : t("common.error")),
  });

  return (
    <Modal
      title={isEdit ? t("tags.dialogEdit") : t("tags.dialogNew")}
      onClose={onClose}
    >
      <div className="space-y-3">
        <label className="block text-sm">
          <span className="mb-1 block text-xs text-slate-500">
            {t("tags.fieldName")}
          </span>
          <input
            autoFocus
            value={name}
            onChange={(e) => setName(e.target.value)}
            maxLength={64}
            className="w-full rounded border border-slate-300 bg-white px-3 py-2 text-sm dark:border-slate-700 dark:bg-slate-800"
          />
        </label>

        <div>
          <span className="mb-1 block text-xs text-slate-500">
            {t("tags.fieldColor")}
          </span>
          <div className="flex flex-wrap items-center gap-2">
            {TAG_PALETTE.map((c) => (
              <button
                key={c}
                type="button"
                onClick={() => setColor(c)}
                style={{ background: c }}
                className="flex h-7 w-7 items-center justify-center rounded-full border-2 border-transparent transition hover:scale-110"
              >
                {color === c && <Check className="h-4 w-4 text-white" />}
              </button>
            ))}
            <input
              type="color"
              value={color}
              onChange={(e) => setColor(e.target.value)}
              className="h-7 w-7 cursor-pointer rounded border border-slate-300 dark:border-slate-700"
            />
          </div>
        </div>

        {err && (
          <div className="rounded bg-red-50 p-2 text-sm text-red-700 dark:bg-red-950 dark:text-red-300">
            {err}
          </div>
        )}
        <button
          disabled={!name.trim() || m.isPending}
          onClick={() => m.mutate()}
          className="w-full rounded bg-slate-900 py-2 text-white disabled:opacity-50 dark:bg-slate-100 dark:text-slate-900"
        >
          {m.isPending
            ? isEdit
              ? t("common.saving")
              : t("common.creating")
            : isEdit
              ? t("common.save")
              : t("common.create")}
        </button>
      </div>
    </Modal>
  );
}
