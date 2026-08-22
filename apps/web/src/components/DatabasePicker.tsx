import type { DatabaseSummary, DbView } from "@awesome-bookmarks/shared";
import { useQuery } from "@tanstack/react-query";
import { Database, Kanban, LayoutGrid, Plus, Search, Table2 } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import { api } from "../api.js";
import { Modal } from "./Modal.js";

export interface PickedDatabase {
  id: string;
  name: string;
  /** Null means "show the whole thing, with its strip of tabs". */
  viewId: string | null;
}

const ICONS = { table: Table2, board: Kanban, gallery: LayoutGrid } as const;

/**
 * Choose what to put in the note: a new table, or one that already exists.
 *
 * Creating was the only option before, which meant the same data had to be
 * duplicated to appear in a second note. Embedding an existing one is the more
 * common case in practice: the table of suppliers belongs in the supplier
 * folder *and* in this quarter's notes, and it has to be the same table or the
 * two drift apart within a week.
 *
 * Picking a view at the same time is deliberate. An embedded table is usually
 * meant to be one table rather than a switcher, and choosing here is the moment
 * where the person knows which one they meant.
 */
export function DatabasePicker({
  onPick,
  onCreate,
  onClose,
}: {
  onPick: (picked: PickedDatabase) => void;
  onCreate: () => void;
  onClose: () => void;
}) {
  const { t } = useTranslation();
  const [q, setQ] = useState("");
  const [chosen, setChosen] = useState<DatabaseSummary | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    inputRef.current?.focus();
  }, []);

  const { data: list } = useQuery({
    queryKey: ["databases"],
    queryFn: () => api.listDatabases(),
  });

  // Only fetched once something is chosen: listing every view of every table
  // up front would be a request per table for information nobody has asked for.
  const { data: detail } = useQuery({
    queryKey: ["database", chosen?.id],
    queryFn: () => api.getDatabase(chosen!.id),
    enabled: !!chosen,
  });

  const needle = q.trim().toLowerCase();
  const rows = (list ?? []).filter(
    (d) => !needle || d.name.toLowerCase().includes(needle),
  );

  if (chosen) {
    const views: DbView[] = detail?.views ?? [];
    return (
      <Modal
        title={t("db.pickView", { name: chosen.name })}
        onClose={onClose}
        size="md"
      >
        <div className="space-y-2">
          <p className="text-sm text-slate-500">{t("db.pickViewHint")}</p>
          <ul className="divide-y divide-slate-200 rounded border border-slate-200 dark:divide-slate-800 dark:border-slate-800">
            <li>
              <button
                type="button"
                onClick={() =>
                  onPick({ id: chosen.id, name: chosen.name, viewId: null })
                }
                className="flex w-full items-center gap-2 px-3 py-2 text-left hover:bg-slate-50 dark:hover:bg-slate-800"
              >
                <Database className="h-4 w-4 shrink-0 text-slate-400" />
                <span className="text-sm">{t("db.wholeDatabase")}</span>
              </button>
            </li>
            {views.map((v) => {
              const Icon = ICONS[v.kind];
              return (
                <li key={v.id}>
                  <button
                    type="button"
                    onClick={() =>
                      onPick({ id: chosen.id, name: chosen.name, viewId: v.id })
                    }
                    className="flex w-full items-center gap-2 px-3 py-2 text-left hover:bg-slate-50 dark:hover:bg-slate-800"
                  >
                    <Icon className="h-4 w-4 shrink-0 text-slate-400" />
                    <span className="min-w-0 flex-1 truncate text-sm">
                      {v.name}
                    </span>
                    <span className="text-xs text-slate-400">
                      {t(`db.view.${v.kind}` as "db.view.table")}
                    </span>
                  </button>
                </li>
              );
            })}
          </ul>
          <div className="flex justify-between">
            <button
              type="button"
              onClick={() => setChosen(null)}
              className="rounded border border-slate-300 px-3 py-1.5 text-sm dark:border-slate-700"
            >
              {t("common.back")}
            </button>
            <button
              type="button"
              onClick={onClose}
              className="rounded border border-slate-300 px-3 py-1.5 text-sm dark:border-slate-700"
            >
              {t("common.cancel")}
            </button>
          </div>
        </div>
      </Modal>
    );
  }

  return (
    <Modal title={t("db.insert")} onClose={onClose} size="md">
      <div className="space-y-2">
        <button
          type="button"
          onClick={onCreate}
          className="flex w-full items-center gap-2 rounded border border-slate-300 px-3 py-2 text-left hover:bg-slate-50 dark:border-slate-700 dark:hover:bg-slate-800"
        >
          <Plus className="h-4 w-4 shrink-0 text-slate-400" />
          <span className="text-sm font-medium">{t("db.newDatabase")}</span>
        </button>

        <div className="flex items-center gap-2 rounded border border-slate-300 px-2 dark:border-slate-700">
          <Search className="h-4 w-4 shrink-0 text-slate-400" />
          <input
            ref={inputRef}
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder={t("db.searchExisting")}
            className="w-full bg-transparent py-2 text-sm outline-none"
          />
        </div>

        <ul className="max-h-72 divide-y divide-slate-200 overflow-y-auto rounded border border-slate-200 dark:divide-slate-800 dark:border-slate-800">
          {rows.length === 0 && (
            <li className="px-3 py-6 text-center text-sm text-slate-400">
              {t("db.noDatabases")}
            </li>
          )}
          {rows.map((d) => (
            <li key={d.id}>
              <button
                type="button"
                onClick={() => setChosen(d)}
                className="flex w-full items-center gap-2 px-3 py-2 text-left hover:bg-slate-50 dark:hover:bg-slate-800"
              >
                <Database className="h-4 w-4 shrink-0 text-slate-400" />
                <span className="min-w-0 flex-1 truncate text-sm">{d.name}</span>
                <span className="shrink-0 text-xs text-slate-400">
                  {t("db.rowCount", { count: d.rowCount })}
                </span>
              </button>
            </li>
          ))}
        </ul>
      </div>
    </Modal>
  );
}
