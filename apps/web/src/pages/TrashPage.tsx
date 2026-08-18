import type { TrashItem } from "@awesome-bookmarks/shared";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  ExternalLink,
  FolderClosed,
  Info,
  RotateCcw,
  Trash2,
  X,
} from "lucide-react";
import { useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import { api } from "../api.js";
import { LetterIcon } from "../components/LetterIcon.js";
import { fmtDateTime } from "../lib/date.js";

/** Walk `item` up through the deletion's folders looking for `root`. */
function descendsFrom(
  item: TrashItem,
  root: TrashItem,
  group: TrashItem[],
): boolean {
  const byId = new Map(
    group.filter((i) => i.type === "folder").map((i) => [i.id, i] as const),
  );
  let cur = item.parentId;
  const seen = new Set<string>();
  while (cur && !seen.has(cur)) {
    if (cur === root.id) return true;
    seen.add(cur);
    cur = byId.get(cur)?.parentId ?? null;
  }
  return false;
}

/**
 * Everything deleted in the app is only stamped `deletedAt`, so nothing here
 * is recovered by magic: it was simply never thrown away. The page makes that
 * visible and reversible.
 *
 * Nothing expires on its own. Auto-expiry would quietly destroy data that
 * survives today, which is a much worse failure than a trash that grows, so
 * purging is always something the user asks for.
 */
export function TrashPage() {
  const { t } = useTranslation();
  const qc = useQueryClient();
  const [msg, setMsg] = useState<string | null>(null);
  const [err, setErr] = useState<string | null>(null);

  const trash = useQuery({
    queryKey: ["trash", "list"],
    queryFn: () => api.listTrash(t("sidebar.home")),
  });

  const refresh = () => {
    qc.invalidateQueries({ queryKey: ["trash"] });
    qc.invalidateQueries({ queryKey: ["folders"] });
    qc.invalidateQueries({ queryKey: ["bookmarks"] });
  };

  const restore = useMutation({
    mutationFn: (it: TrashItem) => api.restoreTrash(it.type, it.id),
    onSuccess: (res) => {
      setErr(null);
      setMsg(
        res.movedToRoot
          ? t("trash.restoredToRoot", {
              count: res.folders + res.bookmarks,
            })
          : t("trash.restored", { count: res.folders + res.bookmarks }),
      );
      refresh();
    },
    onError: (e) => setErr(e instanceof Error ? e.message : t("common.error")),
  });

  const purgeOne = useMutation({
    mutationFn: (it: TrashItem) => api.purgeTrashItem(it.type, it.id),
    onSuccess: () => {
      setErr(null);
      setMsg(t("trash.purgedOne"));
      refresh();
    },
    onError: (e) => setErr(e instanceof Error ? e.message : t("common.error")),
  });

  const purgeAll = useMutation({
    mutationFn: (olderThanDays?: number) => api.purgeTrash(olderThanDays),
    onSuccess: (res) => {
      setErr(null);
      setMsg(t("trash.purged", { count: res.folders + res.bookmarks }));
      refresh();
    },
    onError: (e) => setErr(e instanceof Error ? e.message : t("common.error")),
  });

  const items = trash.data ?? [];

  /**
   * Deleting a folder stamps its whole subtree at once, so the trash is full
   * of rows the user never removed individually. Show only the roots of each
   * cascade — an item whose parent is not itself in the same deletion — and
   * hide the rest behind a disclosure.
   *
   * The grouping matches what restore actually does (a folder brings back its
   * same-stamp subtree, a loose bookmark brings back only itself), so the card
   * never promises more than the button delivers.
   */
  const groups = useMemo(() => {
    const byKey = new Map<string, TrashItem[]>();
    for (const it of items) {
      const list = byKey.get(it.groupKey) ?? [];
      list.push(it);
      byKey.set(it.groupKey, list);
    }
    const out: Array<{ key: string; lead: TrashItem; contained: TrashItem[] }> = [];
    for (const [key, list] of byKey) {
      const folderIds = new Set(
        list.filter((i) => i.type === "folder").map((i) => i.id),
      );
      const roots = list.filter((i) => !i.parentId || !folderIds.has(i.parentId));
      for (const lead of roots) {
        const contained =
          lead.type === "folder"
            ? list.filter((i) => i.id !== lead.id && descendsFrom(i, lead, list))
            : [];
        out.push({ key: `${key}:${lead.type}:${lead.id}`, lead, contained });
      }
    }
    return out.sort(
      (a, b) => b.lead.deletedAt.localeCompare(a.lead.deletedAt) ||
        a.lead.title.localeCompare(b.lead.title),
    );
  }, [items]);

  const oldCount = useMemo(() => {
    const cutoff = Date.now() - 30 * 86_400_000;
    return items.filter((i) => new Date(i.deletedAt).getTime() < cutoff).length;
  }, [items]);

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-2">
        <Trash2 className="h-5 w-5 text-slate-400" />
        <h1 className="text-xl font-semibold">{t("trash.title")}</h1>
        {items.length > 0 && (
          <span className="text-xs text-slate-500">
            {t("trash.count", { count: items.length })}
          </span>
        )}
        {items.length > 0 && (
          <div className="ml-auto flex flex-wrap items-center gap-2">
            {oldCount > 0 && (
              <button
                type="button"
                onClick={() => {
                  if (confirm(t("trash.confirmPurgeOld", { count: oldCount }))) {
                    purgeAll.mutate(30);
                  }
                }}
                disabled={purgeAll.isPending}
                className="rounded border border-slate-300 px-2.5 py-1 text-xs hover:bg-slate-100 disabled:opacity-50 dark:border-slate-700 dark:hover:bg-slate-800"
              >
                {t("trash.purgeOld", { count: oldCount })}
              </button>
            )}
            <button
              type="button"
              onClick={() => {
                if (confirm(t("trash.confirmPurgeAll", { count: items.length }))) {
                  purgeAll.mutate(undefined);
                }
              }}
              disabled={purgeAll.isPending}
              className="rounded border border-red-300 px-2.5 py-1 text-xs text-red-700 hover:bg-red-50 disabled:opacity-50 dark:border-red-800 dark:text-red-300 dark:hover:bg-red-950"
            >
              {t("trash.purgeAll")}
            </button>
          </div>
        )}
      </div>

      <p className="flex items-start gap-2 rounded border border-slate-200 bg-slate-50 p-2 text-xs text-slate-500 dark:border-slate-800 dark:bg-slate-900">
        <Info className="mt-0.5 h-3.5 w-3.5 shrink-0" />
        {t("trash.retentionNote")}
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

      {trash.isLoading && <p className="text-sm text-slate-400">{t("common.loading")}</p>}

      {!trash.isLoading && items.length === 0 && (
        <p className="text-sm text-slate-400">{t("trash.empty")}</p>
      )}

      <div className="space-y-2">
        {groups.map(({ key, lead, contained }) => (
          <div
            key={key}
            data-testid="trash-item"
            className="rounded border border-slate-200 bg-white p-3 dark:border-slate-800 dark:bg-slate-900"
          >
            <div className="flex items-start gap-3">
              {lead.type === "folder" ? (
                <FolderClosed className="mt-0.5 h-5 w-5 shrink-0 text-slate-400" />
              ) : (
                <LetterIcon
                  label={lead.title || lead.url || "?"}
                  seed={lead.url ?? lead.id}
                  size="h-5 w-5"
                />
              )}
              <div className="min-w-0 flex-1">
                <div className="truncate text-sm font-medium">{lead.title}</div>
                <div className="truncate text-xs text-slate-500">
                  {t("trash.from", { path: lead.path })} ·{" "}
                  {fmtDateTime(lead.deletedAt)}
                </div>
                {contained.length > 0 && (
                  <div className="mt-1 text-xs text-slate-400">
                    {t("trash.alsoContains", { count: contained.length })}
                  </div>
                )}
              </div>
              <div className="flex shrink-0 items-center gap-1">
                <button
                  type="button"
                  onClick={() => restore.mutate(lead)}
                  disabled={restore.isPending}
                  title={t("trash.restore")}
                  aria-label={t("trash.restore")}
                  className="rounded border border-slate-300 p-1.5 hover:bg-slate-100 disabled:opacity-50 dark:border-slate-700 dark:hover:bg-slate-800"
                >
                  <RotateCcw className="h-4 w-4" />
                </button>
                <button
                  type="button"
                  onClick={() => {
                    if (confirm(t("trash.confirmPurgeItem", { title: lead.title }))) {
                      purgeOne.mutate(lead);
                    }
                  }}
                  disabled={purgeOne.isPending}
                  title={t("trash.purgeItem")}
                  aria-label={t("trash.purgeItem")}
                  className="rounded border border-red-300 p-1.5 text-red-600 hover:bg-red-50 disabled:opacity-50 dark:border-red-800 dark:hover:bg-red-950"
                >
                  <Trash2 className="h-4 w-4" />
                </button>
              </div>
            </div>

            {contained.length > 0 && (
              <details className="mt-2">
                <summary className="cursor-pointer text-xs text-slate-500 hover:text-slate-900 dark:hover:text-slate-100">
                  {t("trash.showContents")}
                </summary>
                <ul className="mt-1 space-y-0.5 pl-6 text-xs text-slate-500">
                  {contained.map((i) => (
                    <li key={`${i.type}:${i.id}`} className="flex items-center gap-1.5">
                      {i.type === "folder" ? (
                        <FolderClosed className="h-3 w-3 shrink-0" />
                      ) : (
                        <ExternalLink className="h-3 w-3 shrink-0" />
                      )}
                      <span className="truncate">{i.title}</span>
                    </li>
                  ))}
                </ul>
              </details>
            )}
          </div>
        ))}
      </div>
    </div>
  );
}
