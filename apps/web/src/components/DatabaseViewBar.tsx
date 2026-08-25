import type {
  DatabaseDetail,
  DbView,
  ViewKind,
} from "@awesome-bookmarks/shared";
import { useMutation } from "@tanstack/react-query";
import {
  CalendarDays,
  ArrowUpDown,
  Filter,
  Kanban,
  LayoutGrid,
  Plus,
  Table2,
  X,
} from "lucide-react";
import { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import { api } from "../api.js";
import { ViewSettings } from "./DatabaseViewSettings.js";
import { dlg } from "./dialogs.js";

const ICONS: Record<ViewKind, typeof Table2> = {
  table: Table2,
  board: Kanban,
  gallery: LayoutGrid,
  calendar: CalendarDays,
};

/**
 * The strip of views above a database.
 *
 * A view is a saved way of looking at the same rows, so switching one must
 * never touch the data: everything here writes to the view's own config and
 * nothing writes to a cell.
 */
export function ViewBar({
  db,
  view,
  blockId = null,
  pinned = false,
  onSelect,
  onChanged,
  readOnly = false,
}: {
  db: DatabaseDetail;
  view: DbView;
  /** The embed this bar belongs to, when it is inside a note. */
  blockId?: string | null;
  /** True when the note pinned this view: no tabs, just its controls. */
  pinned?: boolean;
  onSelect: (viewId: string) => void;
  onChanged: () => void;
  readOnly?: boolean;
}) {
  const { t } = useTranslation();
  const [settings, setSettings] = useState<"filters" | "sorts" | null>(null);
  const [adding, setAdding] = useState(false);
  const [renaming, setRenaming] = useState(false);
  const [draft, setDraft] = useState(view.name);

  useEffect(() => {
    if (!renaming) setDraft(view.name);
  }, [view.name, renaming]);

  /**
   * Named so it cannot collide with a view that already exists. Two tabs both
   * called "Tabla" look like the same thing twice, and there is no way to tell
   * which one you are configuring.
   */
  const nameFor = (kind: ViewKind) => {
    const base = t(`db.view.${kind}` as "db.view.table");
    const taken = new Set(db.views.map((v) => v.name));
    if (!taken.has(base)) return base;
    for (let n = 2; n < 100; n++) {
      if (!taken.has(`${base} ${n}`)) return `${base} ${n}`;
    }
    return base;
  };

  const create = useMutation({
    mutationFn: ({ kind, onlyHere }: { kind: ViewKind; onlyHere: boolean }) =>
      api.addDbView(db.id, {
        kind,
        name: nameFor(kind),
        // Private to this embed when asked for, so the same table used in
        // another note is not cluttered with a view meant for this one.
        blockId: onlyHere && blockId ? blockId : undefined,
      }),
    onSuccess: (created) => {
      setAdding(false);
      onChanged();
      onSelect(created.id);
    },
  });

  const rename = useMutation({
    mutationFn: (name: string) => api.updateDbView(db.id, view.id, { name }),
    onSuccess: onChanged,
  });

  const remove = useMutation({
    mutationFn: (viewId: string) => api.deleteDbView(db.id, viewId),
    onSuccess: () => {
      onSelect(db.views.find((v) => v.id !== view.id)?.id ?? "");
      onChanged();
    },
  });

  const activeFilters = view.config.filters.length;
  const activeSorts = view.config.sorts.length;

  return (
    <div className="flex flex-wrap items-center gap-1 border-b border-slate-200 px-2 py-1 dark:border-slate-700">
      {pinned ? (
        <span className="flex items-center gap-1 rounded bg-slate-200 px-2 py-1 text-xs dark:bg-slate-700">
          {(() => {
            const Icon = ICONS[view.kind];
            return <Icon className="h-3.5 w-3.5" />;
          })()}
          {view.name}
          {view.blockId && (
            <span className="rounded bg-slate-300 px-1 text-[10px] dark:bg-slate-600">
              {t("db.onlyHereBadge")}
            </span>
          )}
        </span>
      ) : (
      db.views.map((v) => {
        const Icon = ICONS[v.kind];
        const on = v.id === view.id;
        if (on && renaming && !readOnly) {
          return (
            <input
              key={v.id}
              value={draft}
              autoFocus
              aria-label={t("db.renameView")}
              onChange={(e) => setDraft(e.target.value)}
              onBlur={() => {
                setRenaming(false);
                const next = draft.trim();
                if (next && next !== v.name) rename.mutate(next);
              }}
              onKeyDown={(e) => {
                if (e.key === "Enter") (e.target as HTMLInputElement).blur();
                if (e.key === "Escape") {
                  setDraft(v.name);
                  setRenaming(false);
                }
              }}
              className="w-28 rounded border border-slate-300 px-1 py-0.5 text-xs dark:border-slate-600 dark:bg-slate-800"
            />
          );
        }
        return (
          <button
            key={v.id}
            type="button"
            // Clicking the tab you are already on renames it, which is where
            // people look for it and costs no extra control in the strip.
            onClick={() => (on && !readOnly ? setRenaming(true) : onSelect(v.id))}
            title={on && !readOnly ? t("db.renameView") : v.name}
            className={`flex items-center gap-1 rounded px-2 py-1 text-xs ${
              on
                ? "bg-slate-200 dark:bg-slate-700"
                : "text-slate-500 hover:bg-slate-100 dark:hover:bg-slate-800"
            }`}
          >
            <Icon className="h-3.5 w-3.5" />
            {v.name}
          </button>
        );
      }))}

      {!readOnly && !pinned && (
        <span className="relative">
          <button
            type="button"
            onClick={() => setAdding((v) => !v)}
            title={t("db.addView")}
            aria-label={t("db.addView")}
            className="rounded p-1 text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-800"
          >
            <Plus className="h-3.5 w-3.5" />
          </button>
          {adding && (
            <span
              data-testid="db-add-view-menu"
              className="absolute left-0 top-full z-30 mt-1 flex w-52 flex-col rounded border border-slate-200 bg-white p-1 shadow-lg dark:border-slate-700 dark:bg-slate-900"
            >
              <span className="px-2 py-1 text-[10px] uppercase text-slate-400">
                {t("db.sameRows")}
              </span>
              {(["table", "board", "gallery", "calendar"] as ViewKind[]).map((k) => {
                const Icon = ICONS[k];
                return (
                  <button
                    key={k}
                    type="button"
                    onClick={() => create.mutate({ kind: k, onlyHere: false })}
                    className="flex items-center gap-2 rounded px-2 py-1.5 text-left text-xs hover:bg-slate-100 dark:hover:bg-slate-800"
                  >
                    <Icon className="h-3.5 w-3.5 text-slate-400" />
                    {t(`db.view.${k}` as "db.view.table")}
                  </button>
                );
              })}
              {blockId && (
                <>
                  <span className="my-1 border-t border-slate-200 dark:border-slate-700" />
                  <span className="px-2 pb-1 text-[10px] uppercase text-slate-400">
                    {t("db.onlyHereHint")}
                  </span>
                  <button
                    type="button"
                    onClick={() => create.mutate({ kind: "table", onlyHere: true })}
                    className="flex items-center gap-2 rounded px-2 py-1.5 text-left text-xs hover:bg-slate-100 dark:hover:bg-slate-800"
                  >
                    <Table2 className="h-3.5 w-3.5 text-slate-400" />
                    {t("db.onlyHere")}
                  </button>
                </>
              )}
            </span>
          )}
        </span>
      )}

      <span className="ml-auto flex items-center gap-1">
        {!readOnly && (
          <>
            <button
              type="button"
              onClick={() => setSettings("filters")}
              title={t("db.filters")}
              className={`flex items-center gap-1 rounded px-2 py-1 text-xs ${
                activeFilters
                  ? "bg-sky-100 text-sky-700 dark:bg-sky-950 dark:text-sky-300"
                  : "text-slate-500 hover:bg-slate-100 dark:hover:bg-slate-800"
              }`}
            >
              <Filter className="h-3.5 w-3.5" />
              {activeFilters > 0 && activeFilters}
            </button>
            <button
              type="button"
              onClick={() => setSettings("sorts")}
              title={t("db.sorts")}
              className={`flex items-center gap-1 rounded px-2 py-1 text-xs ${
                activeSorts
                  ? "bg-sky-100 text-sky-700 dark:bg-sky-950 dark:text-sky-300"
                  : "text-slate-500 hover:bg-slate-100 dark:hover:bg-slate-800"
              }`}
            >
              <ArrowUpDown className="h-3.5 w-3.5" />
              {activeSorts > 0 && activeSorts}
            </button>
            {db.views.length > 1 && (
              <button
                type="button"
                onClick={async () => {
                  if (
                    await dlg.confirm({
                      message: t("db.confirmDeleteView", { name: view.name }),
                      danger: true,
                    })
                  )
                    remove.mutate(view.id);
                }}
                title={t("db.deleteView")}
                aria-label={t("db.deleteView")}
                className="rounded p-1 text-slate-400 hover:bg-red-50 hover:text-red-600 dark:hover:bg-red-950"
              >
                <X className="h-3.5 w-3.5" />
              </button>
            )}
          </>
        )}
      </span>

      {settings && (
        <ViewSettings
          db={db}
          view={view}
          tab={settings}
          onClose={() => setSettings(null)}
          onChanged={onChanged}
        />
      )}
    </div>
  );
}
