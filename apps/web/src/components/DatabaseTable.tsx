import {
  emptyValue,
  type CellValue,
  type ColumnKind,
  type DatabaseDetail,
  type DbColumn,
  type DbRow,
} from "@awesome-bookmarks/shared";
import { GripVertical, Plus, Settings2, Trash2 } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import { ColumnMenu } from "./DatabaseColumnMenu.js";
import { DatabaseCell } from "./DatabaseCell.js";
import { dlg } from "./dialogs.js";

/**
 * The table view.
 *
 * Rows are dragged with the plain HTML drag API rather than a library. The
 * grid is a table, the handles are one per row, and pulling in dnd-kit for
 * this one gesture would be more code than the gesture.
 */
export function DatabaseTable({
  db,
  rows,
  onCell,
  onAddRow,
  onDeleteRow,
  onReorder,
  onReorderColumns,
  onColumnChanged,
  readOnly = false,
}: {
  db: DatabaseDetail;
  /** Already filtered and sorted by the active view. */
  rows: DbRow[];
  onCell: (rowId: string, columnId: string, value: CellValue) => void;
  onAddRow: () => void;
  onDeleteRow: (rowId: string) => void;
  onReorder: (order: string[]) => void;
  onReorderColumns: (order: string[]) => void;
  onColumnChanged: () => void;
  readOnly?: boolean;
}) {
  const { t } = useTranslation();
  const [menuFor, setMenuFor] = useState<DbColumn | null>(null);
  const [adding, setAdding] = useState(false);
  const dragId = useRef<string | null>(null);
  const [dropTarget, setDropTarget] = useState<string | null>(null);
  const dragCol = useRef<string | null>(null);
  const [colTarget, setColTarget] = useState<string | null>(null);

  // Dragging only makes sense against the stored order. With a sort applied
  // the rows on screen are not the rows in the table, and dropping one "above"
  // another would either be ignored or move something else.
  const sorted = rows;

  return (
    <div className="overflow-x-auto">
      <table className="w-full border-collapse text-sm">
        <thead>
          <tr className="border-b border-slate-200 dark:border-slate-700">
            {!readOnly && <th className="w-6" />}
            {db.columns.map((c) => (
              <th
                key={c.id}
                style={c.config.width ? { width: c.config.width } : undefined}
                onDragOver={(e) => {
                  if (!dragCol.current) return;
                  e.preventDefault();
                  setColTarget(c.id);
                }}
                onDrop={(e) => {
                  e.preventDefault();
                  const from = dragCol.current;
                  dragCol.current = null;
                  setColTarget(null);
                  if (!from || from === c.id) return;
                  const ids = db.columns
                    .map((x) => x.id)
                    .filter((id) => id !== from);
                  ids.splice(ids.indexOf(c.id), 0, from);
                  onReorderColumns(ids);
                }}
                className={`px-2 py-1.5 text-left font-medium text-slate-500 ${
                  colTarget === c.id ? "bg-sky-50 dark:bg-sky-950/40" : ""
                }`}
              >
                <span className="flex items-center gap-1">
                  {/* The name is the handle. A column is its name, so that is
                      what you reach for to move it; a separate grip would be a
                      second target for the same idea in a row of headers that
                      is already tight. */}
                  <span
                    draggable={!readOnly}
                    onDragStart={() => {
                      dragCol.current = c.id;
                    }}
                    onDragEnd={() => {
                      dragCol.current = null;
                      setColTarget(null);
                    }}
                    title={readOnly ? undefined : t("db.dragColumn")}
                    className={`truncate ${readOnly ? "" : "cursor-grab"}`}
                  >
                    {c.name}
                  </span>
                  <span className="text-[10px] uppercase text-slate-400">
                    {t(`db.kind.${c.kind}` as "db.kind.text")}
                  </span>
                  {!readOnly && (
                    <button
                      type="button"
                      onClick={() => setMenuFor(c)}
                      title={t("db.columnSettings")}
                      aria-label={`${t("db.columnSettings")}: ${c.name}`}
                      className="ml-auto rounded p-0.5 text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-800"
                    >
                      <Settings2 className="h-3.5 w-3.5" />
                    </button>
                  )}
                </span>
              </th>
            ))}
            {!readOnly && (
              <th className="w-8">
                <button
                  type="button"
                  onClick={() => setAdding(true)}
                  title={t("db.addColumn")}
                  aria-label={t("db.addColumn")}
                  className="rounded p-1 text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-800"
                >
                  <Plus className="h-4 w-4" />
                </button>
              </th>
            )}
          </tr>
        </thead>
        <tbody>
          {sorted.length === 0 && (
            <tr>
              <td
                colSpan={db.columns.length + 2}
                className="px-2 py-6 text-center text-xs text-slate-400"
              >
                {t("db.noRows")}
              </td>
            </tr>
          )}
          {sorted.map((r) => (
            <tr
              key={r.id}
              data-testid="db-row"
              onDragOver={(e) => {
                if (!dragId.current) return;
                e.preventDefault();
                setDropTarget(r.id);
              }}
              onDrop={(e) => {
                e.preventDefault();
                const from = dragId.current;
                dragId.current = null;
                setDropTarget(null);
                if (!from || from === r.id) return;
                const ids = sorted.map((x) => x.id).filter((id) => id !== from);
                const at = ids.indexOf(r.id);
                ids.splice(at, 0, from);
                onReorder(ids);
              }}
              className={`border-b border-slate-100 dark:border-slate-800 ${
                dropTarget === r.id ? "bg-sky-50 dark:bg-sky-950/40" : ""
              }`}
            >
              {!readOnly && (
                <td className="align-middle">
                  <span
                    draggable
                    onDragStart={() => {
                      dragId.current = r.id;
                    }}
                    onDragEnd={() => {
                      dragId.current = null;
                      setDropTarget(null);
                    }}
                    title={t("db.dragRow")}
                    className="flex cursor-grab justify-center text-slate-300 hover:text-slate-500"
                  >
                    <GripVertical className="h-4 w-4" />
                  </span>
                </td>
              )}
              {db.columns.map((c) => (
                <td key={c.id} className="px-2 py-1 align-top">
                  <DatabaseCell
                    column={c}
                    value={r.cells[c.id]}
                    readOnly={readOnly}
                    onChange={(v) => onCell(r.id, c.id, v)}
                  />
                </td>
              ))}
              {!readOnly && (
                <td className="align-middle">
                  <button
                    type="button"
                    onClick={async () => {
                      if (
                        await dlg.confirm({
                          message: t("db.confirmDeleteRow"),
                          danger: true,
                        })
                      )
                        onDeleteRow(r.id);
                    }}
                    title={t("db.deleteRow")}
                    aria-label={t("db.deleteRow")}
                    className="rounded p-1 text-slate-300 hover:bg-red-50 hover:text-red-600 dark:hover:bg-red-950"
                  >
                    <Trash2 className="h-3.5 w-3.5" />
                  </button>
                </td>
              )}
            </tr>
          ))}
        </tbody>
      </table>

      {!readOnly && (
        <button
          type="button"
          onClick={onAddRow}
          className="mt-1 flex w-full items-center gap-1 rounded px-2 py-1.5 text-xs text-slate-500 hover:bg-slate-100 dark:hover:bg-slate-800"
        >
          <Plus className="h-3.5 w-3.5" />
          {t("db.addRow")}
        </button>
      )}

      {(menuFor || adding) && (
        <ColumnMenu
          databaseId={db.id}
          column={menuFor}
          columns={db.columns}
          onClose={() => {
            setMenuFor(null);
            setAdding(false);
          }}
          onChanged={onColumnChanged}
        />
      )}
    </div>
  );
}

/** Blank cells for a new row, so a fresh row is shaped like the table. */
export function blankCells(columns: DbColumn[]): Record<string, CellValue> {
  const out: Record<string, CellValue> = {};
  for (const c of columns) out[c.id] = emptyValue(c.kind as ColumnKind);
  return out;
}

/** Focus helper used after adding a row, so you can type straight away. */
export function useFocusLastRow(count: number) {
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const inputs = ref.current?.querySelectorAll("tbody tr:last-child input");
    (inputs?.[0] as HTMLInputElement | undefined)?.focus();
  }, [count]);
  return ref;
}
