import type { CellValue, DbColumn, DbRow } from "@awesome-bookmarks/shared";
import { useTranslation } from "react-i18next";
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
  columns,
  row,
  title,
  onCell,
  onClose,
  readOnly = false,
}: {
  columns: DbColumn[];
  row: DbRow;
  /** What the row is called, when a column has been named as its title. */
  title: string | null;
  onCell: (columnId: string, value: CellValue) => void;
  onClose: () => void;
  readOnly?: boolean;
}) {
  const { t } = useTranslation();

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
      </div>
    </Modal>
  );
}
