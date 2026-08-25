import type {
  CellValue,
  DatabaseDetail,
  DbRow,
  ViewConfig,
} from "@awesome-bookmarks/shared";
import { ChevronLeft, ChevronRight } from "lucide-react";
import { useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import { OptionChip } from "./DatabaseCell.js";
import { DatabaseRowModal } from "./DatabaseRowModal.js";

/**
 * The rows of a table laid out on a month.
 *
 * Some tables are about *when*: a reading log, a maintenance schedule, bills.
 * In a grid those are a column of ISO strings you have to read one by one to
 * see that three of them fall in the same week. A month is the shape that
 * question already has an answer in.
 *
 * It groups by one date column, chosen in the view's settings, and it does the
 * grouping on the string rather than on a `Date`. Cells hold `YYYY-MM-DD`
 * exactly as an `<input type="date">` produced it, with no time and no zone;
 * turning that into a `Date` and back is how a task on the 1st shows up on the
 * 30th of the month before for anyone west of Greenwich.
 */
export function DatabaseCalendar({
  db,
  rows,
  config,
  readOnly = false,
  onCell,
  onRefresh,
}: {
  db: DatabaseDetail;
  rows: DbRow[];
  config: ViewConfig;
  readOnly?: boolean;
  onCell: (rowId: string, columnId: string, value: CellValue) => void;
  onRefresh: () => void;
}) {
  const { t } = useTranslation();
  const [monthOffset, setMonthOffset] = useState(0);
  const [openRow, setOpenRow] = useState<DbRow | null>(null);

  const dateColumn =
    db.columns.find((c) => c.id === config.dateColumnId) ??
    db.columns.find((c) => c.kind === "date") ??
    null;

  const titleColumn =
    db.columns.find((c) => c.id === config.titleColumnId) ??
    db.columns.find((c) => c.kind === "text") ??
    null;

  const statusColumn = db.columns.find((c) => c.kind === "select") ?? null;

  /** The month being shown, as {year, month0}. Today's, plus the offset. */
  const cursor = useMemo(() => {
    const now = new Date();
    const d = new Date(now.getFullYear(), now.getMonth() + monthOffset, 1);
    return { year: d.getFullYear(), month0: d.getMonth() };
  }, [monthOffset]);

  const byDay = useMemo(() => {
    const map = new Map<string, DbRow[]>();
    if (!dateColumn) return map;
    for (const row of rows) {
      const value = row.cells[dateColumn.id];
      if (typeof value !== "string" || value.length < 10) continue;
      const day = value.slice(0, 10);
      const list = map.get(day);
      if (list) list.push(row);
      else map.set(day, [row]);
    }
    return map;
  }, [rows, dateColumn]);

  if (!dateColumn) {
    return (
      <p className="px-3 py-6 text-center text-xs text-slate-400">
        {t("db.calendarNeedsDate")}
      </p>
    );
  }

  // Monday-first, which is what the rest of the app's locales expect.
  const first = new Date(cursor.year, cursor.month0, 1);
  const lead = (first.getDay() + 6) % 7;
  const daysInMonth = new Date(cursor.year, cursor.month0 + 1, 0).getDate();
  const cells: (string | null)[] = [
    ...Array.from({ length: lead }, () => null),
    ...Array.from({ length: daysInMonth }, (_, i) => {
      const d = String(i + 1).padStart(2, "0");
      const m = String(cursor.month0 + 1).padStart(2, "0");
      return `${cursor.year}-${m}-${d}`;
    }),
  ];
  while (cells.length % 7 !== 0) cells.push(null);

  const today = new Date();
  const todayKey = `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, "0")}-${String(today.getDate()).padStart(2, "0")}`;

  const monthName = new Intl.DateTimeFormat(undefined, {
    month: "long",
    year: "numeric",
  }).format(first);

  const weekdays = Array.from({ length: 7 }, (_, i) =>
    new Intl.DateTimeFormat(undefined, { weekday: "short" }).format(
      // 2024-01-01 was a Monday, so this walks Monday to Sunday.
      new Date(2024, 0, 1 + i),
    ),
  );

  const labelOf = (row: DbRow): string => {
    const v = titleColumn ? row.cells[titleColumn.id] : null;
    return typeof v === "string" && v.trim() ? v : t("db.rowDetail");
  };

  return (
    <div className="p-2" data-testid="db-calendar">
      <div className="mb-2 flex items-center gap-2">
        <button
          type="button"
          onClick={() => setMonthOffset((m) => m - 1)}
          title={t("db.prevMonth")}
          aria-label={t("db.prevMonth")}
          className="rounded p-1 text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-800"
        >
          <ChevronLeft className="h-4 w-4" />
        </button>
        <span className="text-sm font-medium capitalize">{monthName}</span>
        <button
          type="button"
          onClick={() => setMonthOffset((m) => m + 1)}
          title={t("db.nextMonth")}
          aria-label={t("db.nextMonth")}
          className="rounded p-1 text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-800"
        >
          <ChevronRight className="h-4 w-4" />
        </button>
        {monthOffset !== 0 && (
          <button
            type="button"
            onClick={() => setMonthOffset(0)}
            className="rounded border border-slate-300 px-2 py-0.5 text-xs text-slate-500 hover:bg-slate-100 dark:border-slate-700 dark:hover:bg-slate-800"
          >
            {t("db.today")}
          </button>
        )}
        <span className="ml-auto text-xs text-slate-400">{dateColumn.name}</span>
      </div>

      <div className="grid grid-cols-7 gap-px rounded border border-slate-200 bg-slate-200 text-xs dark:border-slate-700 dark:bg-slate-700">
        {weekdays.map((w) => (
          <div
            key={w}
            className="bg-slate-50 px-1 py-1 text-center text-[10px] uppercase text-slate-400 dark:bg-slate-800"
          >
            {w}
          </div>
        ))}
        {cells.map((day, i) => (
          <div
            key={day ?? `blank-${i}`}
            className={`min-h-[5.5rem] bg-white p-1 align-top dark:bg-slate-900 ${
              day === todayKey ? "ring-1 ring-inset ring-sky-500" : ""
            } ${day ? "" : "opacity-40"}`}
          >
            {day && (
              <>
                <div className="mb-0.5 text-[10px] text-slate-400">
                  {Number(day.slice(8))}
                </div>
                <div className="space-y-0.5">
                  {(byDay.get(day) ?? []).map((row) => {
                    const status = statusColumn
                      ? statusColumn.config.options.find(
                          (o) => o.id === row.cells[statusColumn.id],
                        )
                      : undefined;
                    return (
                      <button
                        key={row.id}
                        type="button"
                        onClick={() => setOpenRow(row)}
                        className="block w-full truncate rounded bg-slate-100 px-1 py-0.5 text-left text-[11px] hover:bg-slate-200 dark:bg-slate-800 dark:hover:bg-slate-700"
                      >
                        {status ? (
                          <span className="mr-1 inline-block align-middle">
                            <OptionChip option={status} />
                          </span>
                        ) : null}
                        {labelOf(row)}
                      </button>
                    );
                  })}
                </div>
              </>
            )}
          </div>
        ))}
      </div>

      {/* Rows with nothing in the date column would simply vanish here, which
          reads as data loss. They are counted instead. */}
      {(() => {
        const undated = rows.filter(
          (r) => typeof r.cells[dateColumn.id] !== "string",
        ).length;
        return undated > 0 ? (
          <p className="mt-2 text-xs text-slate-400">
            {t("db.undatedRows", { count: undated })}
          </p>
        ) : null;
      })()}

      {openRow && (
        <DatabaseRowModal
          databaseId={db.id}
          columns={db.columns}
          row={rows.find((r) => r.id === openRow.id) ?? openRow}
          title={labelOf(openRow)}
          readOnly={readOnly}
          onCell={(columnId, value) => onCell(openRow.id, columnId, value)}
          onRestored={onRefresh}
          onClose={() => setOpenRow(null)}
        />
      )}
    </div>
  );
}
