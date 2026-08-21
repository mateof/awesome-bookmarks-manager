import type {
  DatabaseDetail,
  DbView,
  ViewKind,
} from "@awesome-bookmarks/shared";
import { useMutation } from "@tanstack/react-query";
import {
  ArrowUpDown,
  Filter,
  Kanban,
  LayoutGrid,
  Plus,
  Table2,
  X,
} from "lucide-react";
import { useState } from "react";
import { useTranslation } from "react-i18next";
import { api } from "../api.js";
import { ViewSettings } from "./DatabaseViewSettings.js";
import { dlg } from "./dialogs.js";

const ICONS: Record<ViewKind, typeof Table2> = {
  table: Table2,
  board: Kanban,
  gallery: LayoutGrid,
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
  onSelect,
  onChanged,
  readOnly = false,
}: {
  db: DatabaseDetail;
  view: DbView;
  onSelect: (viewId: string) => void;
  onChanged: () => void;
  readOnly?: boolean;
}) {
  const { t } = useTranslation();
  const [settings, setSettings] = useState<"filters" | "sorts" | null>(null);
  const [adding, setAdding] = useState(false);

  const create = useMutation({
    mutationFn: (kind: ViewKind) =>
      api.addDbView(db.id, { kind, name: t(`db.view.${kind}` as "db.view.table") }),
    onSuccess: (created) => {
      setAdding(false);
      onChanged();
      onSelect(created.id);
    },
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
      {db.views.map((v) => {
        const Icon = ICONS[v.kind];
        const on = v.id === view.id;
        return (
          <button
            key={v.id}
            type="button"
            onClick={() => onSelect(v.id)}
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
      })}

      {!readOnly && (
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
            <span className="absolute left-0 top-full z-30 mt-1 flex w-40 flex-col rounded border border-slate-200 bg-white p-1 shadow-lg dark:border-slate-700 dark:bg-slate-900">
              {(["table", "board", "gallery"] as ViewKind[]).map((k) => {
                const Icon = ICONS[k];
                return (
                  <button
                    key={k}
                    type="button"
                    onClick={() => create.mutate(k)}
                    className="flex items-center gap-2 rounded px-2 py-1.5 text-left text-xs hover:bg-slate-100 dark:hover:bg-slate-800"
                  >
                    <Icon className="h-3.5 w-3.5 text-slate-400" />
                    {t(`db.view.${k}` as "db.view.table")}
                  </button>
                );
              })}
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
