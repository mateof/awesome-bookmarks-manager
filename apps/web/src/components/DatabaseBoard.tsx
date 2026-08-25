import type {
  CellValue,
  DatabaseDetail,
  DbColumn,
  DbRow,
  SelectOption,
  ViewConfig,
} from "@awesome-bookmarks/shared";
import { Plus } from "lucide-react";
import { useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import { DatabaseCell, OptionChip } from "./DatabaseCell.js";

/**
 * The board: the same rows, stacked into columns by one select column.
 *
 * Dragging a card between columns is not a special gesture with its own
 * storage. It writes the target column's option into that row's cell, which is
 * exactly what picking the option from the table would do. That is what keeps
 * the two views describing the same data instead of drifting apart.
 */
export function DatabaseBoard({
  db,
  rows,
  config,
  onCell,
  onAddRow,
  readOnly = false,
}: {
  db: DatabaseDetail;
  rows: DbRow[];
  config: ViewConfig;
  onCell: (rowId: string, columnId: string, value: CellValue) => void;
  onAddRow: (cells: Record<string, CellValue>) => void;
  readOnly?: boolean;
}) {
  const { t } = useTranslation();
  const dragged = useRef<string | null>(null);
  const [over, setOver] = useState<string | null>(null);

  const groupCol = db.columns.find((c) => c.id === config.groupByColumnId);
  if (!groupCol || groupCol.kind !== "select") {
    // Better to say what is missing than to render an empty board that looks
    // like the data is gone.
    return (
      <p className="px-2 py-6 text-center text-xs text-slate-400">
        {t("db.noGroupBy")}
      </p>
    );
  }

  const titleCol =
    db.columns.find((c) => c.id === config.titleColumnId) ?? db.columns[0];

  // An "unassigned" lane always exists: rows with no option set have to live
  // somewhere visible, or they silently vanish from the board.
  const lanes: { key: string; option: SelectOption | null }[] = [
    { key: "", option: null },
    ...groupCol.config.options.map((o) => ({ key: o.id, option: o })),
  ];

  return (
    <div className="flex gap-3 overflow-x-auto pb-2">
      {lanes.map(({ key, option }) => {
        const inLane = rows.filter((r) => (r.cells[groupCol.id] ?? "") === key);
        return (
          <div
            key={key || "none"}
            data-testid="db-lane"
            onDragOver={(e) => {
              if (!dragged.current) return;
              e.preventDefault();
              setOver(key);
            }}
            onDrop={(e) => {
              e.preventDefault();
              const rowId = dragged.current;
              dragged.current = null;
              setOver(null);
              if (rowId) onCell(rowId, groupCol.id, key || null);
            }}
            className={`w-60 shrink-0 rounded-lg border p-2 ${
              over === key
                ? "border-sky-400 bg-sky-50 dark:bg-sky-950/40"
                : "border-slate-200 dark:border-slate-700"
            }`}
          >
            <div className="mb-2 flex items-center gap-2">
              {option ? (
                <OptionChip option={option} />
              ) : (
                <span className="text-xs text-slate-400">{t("db.ungrouped")}</span>
              )}
              <span className="ml-auto text-xs text-slate-400">
                {inLane.length}
              </span>
            </div>

            <div className="space-y-2">
              {inLane.map((r) => (
                <article
                  key={r.id}
                  data-testid="db-card"
                  draggable={!readOnly}
                  onDragStart={() => {
                    dragged.current = r.id;
                  }}
                  onDragEnd={() => {
                    dragged.current = null;
                    setOver(null);
                  }}
                  className="rounded border border-slate-200 bg-white p-2 text-sm shadow-sm dark:border-slate-700 dark:bg-slate-900"
                >
                  <Card
                    db={db}
                    row={r}
                    titleCol={titleCol}
                    skip={[groupCol.id]}
                    config={config}
                    onCell={onCell}
                    readOnly={readOnly}
                  />
                </article>
              ))}
            </div>

            {!readOnly && (
              <button
                type="button"
                onClick={() => onAddRow({ [groupCol.id]: key || null })}
                className="mt-2 flex w-full items-center gap-1 rounded px-2 py-1 text-xs text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-800"
              >
                <Plus className="h-3 w-3" />
                {t("db.addRow")}
              </button>
            )}
          </div>
        );
      })}
    </div>
  );
}

/**
 * The gallery: the same cards without the lanes. Kept in this file because it
 * is the board's card with the grouping taken away, and splitting them would
 * mean maintaining the same card twice.
 */
export function DatabaseGallery({
  db,
  rows,
  config,
  onCell,
  onAddRow,
  readOnly = false,
}: {
  db: DatabaseDetail;
  rows: DbRow[];
  config: ViewConfig;
  onCell: (rowId: string, columnId: string, value: CellValue) => void;
  onAddRow: (cells: Record<string, CellValue>) => void;
  readOnly?: boolean;
}) {
  const { t } = useTranslation();
  const titleCol =
    db.columns.find((c) => c.id === config.titleColumnId) ?? db.columns[0];

  return (
    <div>
      <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
        {rows.length === 0 && (
          <p className="col-span-full px-2 py-6 text-center text-xs text-slate-400">
            {t("db.noRows")}
          </p>
        )}
        {rows.map((r) => (
          <article
            key={r.id}
            data-testid="db-card"
            className="rounded border border-slate-200 p-2 text-sm dark:border-slate-700"
          >
            <Card
              db={db}
              row={r}
              titleCol={titleCol}
              skip={[]}
              config={config}
              onCell={onCell}
              readOnly={readOnly}
            />
          </article>
        ))}
      </div>
      {!readOnly && (
        <button
          type="button"
          onClick={() => onAddRow({})}
          className="mt-2 flex items-center gap-1 rounded px-2 py-1 text-xs text-slate-500 hover:bg-slate-100 dark:hover:bg-slate-800"
        >
          <Plus className="h-3.5 w-3.5" />
          {t("db.addRow")}
        </button>
      )}
    </div>
  );
}

function Card({
  db,
  row,
  titleCol,
  skip,
  config,
  onCell,
  readOnly,
}: {
  db: DatabaseDetail;
  row: DbRow;
  titleCol: DbColumn | undefined;
  /** Columns already expressed by the layout, e.g. the lane a card sits in. */
  skip: string[];
  config: ViewConfig;
  onCell: (rowId: string, columnId: string, value: CellValue) => void;
  readOnly?: boolean;
}) {
  const { t } = useTranslation();
  const rest = db.columns.filter(
    (c) =>
      c.id !== titleCol?.id &&
      !skip.includes(c.id) &&
      !config.hiddenColumnIds.includes(c.id),
  );

  return (
    <>
      {titleCol ? (
        <div className="mb-1 font-medium">
          <DatabaseCell
            column={titleCol}
            value={row.cells[titleCol.id]}
            readOnly={readOnly}
            row={row}
            columns={db.columns}
            onChange={(v) => onCell(row.id, titleCol.id, v)}
          />
        </div>
      ) : (
        <div className="mb-1 text-xs text-slate-400">{t("db.untitled")}</div>
      )}
      <dl className="space-y-1">
        {rest.map((c) => (
          <div key={c.id} className="flex items-start gap-2">
            <dt className="w-20 shrink-0 truncate text-xs text-slate-400">
              {c.name}
            </dt>
            <dd className="min-w-0 flex-1">
              <DatabaseCell
                column={c}
                value={row.cells[c.id]}
                readOnly={readOnly}
                row={row}
                columns={db.columns}
                onChange={(v) => onCell(row.id, c.id, v)}
              />
            </dd>
          </div>
        ))}
      </dl>
    </>
  );
}
