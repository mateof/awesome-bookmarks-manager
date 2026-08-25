import type { CellValue, DbColumn, DbRow } from "@awesome-bookmarks/shared";
import { useMutation, useQuery } from "@tanstack/react-query";
import { History } from "lucide-react";
import { useState } from "react";
import { useTranslation } from "react-i18next";
import { api } from "../api.js";
import { fmtDateTime } from "../lib/date.js";
import { DatabaseCell } from "./DatabaseCell.js";
import { Modal } from "./Modal.js";

/**
 * One row, on its own, as a stack of labelled fields.
 *
 * A table is a good way to compare rows and a bad way to read one. Past four
 * or five columns the interesting value is off to the right, every field is a
 * one-line box however much text is in it, and the column header explaining
 * what you are looking at is up at the top of the grid. Turned on its side the
 * same row is a form: every field labelled next to its value, as much height
 * as the value needs, nothing scrolled out of view sideways.
 *
 * It edits the same cells through the same components, so there is no second
 * implementation of what a date or a select does — this is a different shape
 * for the row, not a different editor.
 */
export function DatabaseRowModal({
  databaseId,
  columns,
  row,
  title,
  onCell,
  onClose,
  onRestored,
  readOnly = false,
}: {
  databaseId: string;
  columns: DbColumn[];
  row: DbRow;
  /** What the row is called, when a column has been named as its title. */
  title: string | null;
  onCell: (columnId: string, value: CellValue) => void;
  onClose: () => void;
  /** The table has to reload: a restore rewrites every cell at once. */
  onRestored: () => void;
  readOnly?: boolean;
}) {
  const { t } = useTranslation();
  const [showHistory, setShowHistory] = useState(false);

  /**
   * Fetched only once the section is opened.
   *
   * Every entry is a sealed blob that has to be decrypted to be listed, so
   * loading the history of every row somebody merely looks at would be work
   * done for nothing on the overwhelming majority of them.
   */
  const versions = useQuery({
    queryKey: ["db", databaseId, "row", row.id, "versions"],
    queryFn: () => api.listRowVersions(databaseId, row.id),
    enabled: showHistory,
    staleTime: 10_000,
  });

  const restore = useMutation({
    mutationFn: (versionId: string) =>
      api.restoreRowVersion(databaseId, row.id, versionId),
    onSuccess: () => {
      void versions.refetch();
      onRestored();
    },
  });

  return (
    <Modal title={title?.trim() || t("db.rowDetail")} onClose={onClose} size="lg">
      <div className="space-y-3">
        {columns.map((c) => (
          <div key={c.id} className="grid gap-1 sm:grid-cols-[10rem_1fr] sm:gap-3">
            <span className="flex items-baseline gap-1.5 pt-1 text-xs font-medium text-slate-500">
              <span className="truncate">{c.name}</span>
              <span className="shrink-0 text-[10px] uppercase text-slate-400">
                {t(`db.kind.${c.kind}` as "db.kind.text")}
              </span>
            </span>
            {/* Bordered here, unlike in the grid: on a form a field with no
                edge reads as text somebody wrote, not as somewhere to type. */}
            <div className="rounded border border-slate-200 px-1.5 py-1 dark:border-slate-700">
              <DatabaseCell
                column={c}
                value={row.cells[c.id]}
                readOnly={readOnly}
                multiline
                onChange={(v) => onCell(c.id, v)}
              />
            </div>
          </div>
        ))}
        {columns.length === 0 && (
          <p className="text-xs text-slate-400">{t("db.noColumns")}</p>
        )}

        {/* A cell saves when you leave it and overwrites what was there, with
            no undo anywhere in a grid. This is that undo. */}
        <div className="border-t border-slate-200 pt-2 dark:border-slate-800">
          <button
            type="button"
            onClick={() => setShowHistory((v) => !v)}
            aria-expanded={showHistory}
            className="flex items-center gap-1 text-xs text-slate-500 hover:text-slate-900 dark:hover:text-slate-100"
          >
            <History className="h-3.5 w-3.5" />
            {t("db.rowHistory")}
          </button>

          {showHistory && (
            <div className="mt-2 space-y-1">
              {versions.isPending && (
                <p className="text-xs text-slate-400">{t("common.loading")}</p>
              )}
              {versions.data?.length === 0 && (
                <p className="text-xs text-slate-400">{t("db.noHistory")}</p>
              )}
              {versions.data?.map((v) => (
                <div
                  key={v.id}
                  data-testid="row-version"
                  className="flex items-center gap-2 rounded border border-slate-200 px-2 py-1 text-xs dark:border-slate-800"
                >
                  <span className="shrink-0 text-slate-400">
                    {fmtDateTime(v.createdAt)}
                  </span>
                  <span className="min-w-0 flex-1 truncate text-slate-600 dark:text-slate-300">
                    {v.label ?? t("db.rowDetail")}
                  </span>
                  {!readOnly && (
                    <button
                      type="button"
                      disabled={restore.isPending}
                      onClick={() => restore.mutate(v.id)}
                      className="shrink-0 rounded border border-slate-300 px-2 py-0.5 hover:bg-slate-100 disabled:opacity-50 dark:border-slate-700 dark:hover:bg-slate-800"
                    >
                      {t("db.restore")}
                    </button>
                  )}
                </div>
              ))}
              {/* Said plainly, because a history that quietly forgets is worse
                  than no history: you would trust it. */}
              <p className="pt-1 text-[11px] text-slate-400">
                {t("db.historyLimit")}
              </p>
            </div>
          )}
        </div>
      </div>
    </Modal>
  );
}
