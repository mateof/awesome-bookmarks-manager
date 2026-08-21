import {
  applyView,
  emptyValue,
  type CellValue,
  type DbRow,
  type ViewConfig,
  type ViewKind,
} from "@awesome-bookmarks/shared";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Database, Plus, Table2 } from "lucide-react";
import { useState } from "react";
import { useTranslation } from "react-i18next";
import { api } from "../api.js";
import { DatabaseTable } from "./DatabaseTable.js";
import { ViewBar } from "./DatabaseViewBar.js";

/**
 * A database, rendered where the note is read.
 *
 * Mounted into the sanitised HTML through a portal, the same way the reference
 * chips get their behaviour: the description arrives as a string, so there is
 * no React node to hang this on and it has to find its own placeholder in the
 * DOM.
 */
export function DatabaseBlock({
  databaseId,
  fallbackName,
  readOnly = false,
}: {
  databaseId: string;
  /** Written into the note, so the card has a name before anything loads. */
  fallbackName?: string;
  readOnly?: boolean;
}) {
  const { t } = useTranslation();
  const qc = useQueryClient();
  const key = ["database", databaseId];
  const [activeViewId, setActiveViewId] = useState<string | null>(null);

  const { data: db, isError } = useQuery({
    queryKey: key,
    queryFn: () => api.getDatabase(databaseId),
  });

  const refresh = () => {
    qc.invalidateQueries({ queryKey: key });
    qc.invalidateQueries({ queryKey: ["storage"] });
  };

  const cell = useMutation({
    mutationFn: ({
      rowId,
      columnId,
      value,
    }: {
      rowId: string;
      columnId: string;
      value: CellValue;
    }) => api.updateDbRow(databaseId, rowId, { cells: { [columnId]: value } }),
    // Optimistic: a cell that waits for a round trip before showing what you
    // typed feels broken, and the server merges rather than replaces, so a
    // stale local copy cannot clobber another column.
    onMutate: async ({ rowId, columnId, value }) => {
      await qc.cancelQueries({ queryKey: key });
      const before = qc.getQueryData(key);
      qc.setQueryData(key, (old: typeof db) =>
        old
          ? {
              ...old,
              rows: old.rows.map((r) =>
                r.id === rowId
                  ? { ...r, cells: { ...r.cells, [columnId]: value } }
                  : r,
              ),
            }
          : old,
      );
      return { before };
    },
    onError: (_e, _v, ctxData) => {
      if (ctxData?.before) qc.setQueryData(key, ctxData.before);
    },
    onSettled: refresh,
  });

  const addRow = useMutation({
    mutationFn: () => {
      const cells: Record<string, CellValue> = {};
      for (const c of db?.columns ?? []) cells[c.id] = emptyValue(c.kind);
      return api.addDbRow(databaseId, cells);
    },
    onSuccess: refresh,
  });

  const removeRow = useMutation({
    mutationFn: (rowId: string) => api.deleteDbRow(databaseId, rowId),
    onSuccess: refresh,
  });

  const reorder = useMutation({
    mutationFn: (order: string[]) => api.reorderDbRows(databaseId, order),
    onSuccess: refresh,
  });

  if (isError) {
    // The note outlived the table. Saying so beats an empty box that looks
    // like a rendering bug.
    return (
      <div className="my-2 rounded border border-dashed border-red-300 px-3 py-2 text-sm text-slate-400 dark:border-red-800">
        {t("db.missing", { name: fallbackName || "" })}
      </div>
    );
  }

  if (!db) {
    return (
      <div className="my-2 flex items-center gap-2 rounded border border-slate-200 px-3 py-2 text-sm text-slate-400 dark:border-slate-700">
        <Database className="h-4 w-4" />
        {fallbackName || t("db.loading")}
      </div>
    );
  }

  const view =
    db.views.find((v) => v.id === activeViewId) ?? db.views[0] ?? null;
  const config: ViewConfig = view?.config ?? {
    filters: [],
    sorts: [],
    hiddenColumnIds: [],
    groupByColumnId: null,
    titleColumnId: null,
  };
  const visibleColumns = db.columns.filter(
    (c) => !config.hiddenColumnIds.includes(c.id),
  );
  const rows: DbRow[] = applyView(db.rows, db.columns, config);
  const shown = { ...db, columns: visibleColumns };

  return (
    <div
      data-testid="db-block"
      className="my-3 rounded-lg border border-slate-200 dark:border-slate-700"
    >
      <div className="flex items-center gap-2 border-b border-slate-200 px-3 py-1.5 dark:border-slate-700">
        <Table2 className="h-4 w-4 shrink-0 text-slate-400" />
        <span className="truncate text-sm font-medium">{db.name}</span>
        <span className="text-xs text-slate-400">
          {t("db.rowCount", { count: db.rows.length })}
        </span>
      </div>

      {view && (
        <ViewBar
          db={db}
          view={view}
          readOnly={readOnly}
          onSelect={setActiveViewId}
          onChanged={refresh}
        />
      )}

      <div className="p-2">
        {renderView(view?.kind ?? "table")}
      </div>
    </div>
  );

  function renderView(kind: ViewKind) {
    if (kind === "table") {
      return (
        <DatabaseTable
          db={shown}
          rows={rows}
          readOnly={readOnly}
          onCell={(rowId, columnId, value) =>
            cell.mutate({ rowId, columnId, value })
          }
          onAddRow={() => addRow.mutate()}
          onDeleteRow={(id) => removeRow.mutate(id)}
          onReorder={(order) => reorder.mutate(order)}
          onColumnChanged={refresh}
        />
      );
    }
    // Board and gallery arrive in the next step; until then the table is a
    // correct rendering of the same data rather than an empty panel.
    return (
      <DatabaseTable
        db={shown}
        rows={rows}
        readOnly={readOnly}
        onCell={(rowId, columnId, value) =>
          cell.mutate({ rowId, columnId, value })
        }
        onAddRow={() => addRow.mutate()}
        onDeleteRow={(id) => removeRow.mutate(id)}
        onReorder={(order) => reorder.mutate(order)}
        onColumnChanged={refresh}
      />
    );
  }
}

/** Standalone card used by the databases page. */
export function DatabaseCard({
  id,
  name,
  rowCount,
  onOpen,
}: {
  id: string;
  name: string;
  rowCount: number;
  onOpen: (id: string) => void;
}) {
  const { t } = useTranslation();
  return (
    <button
      type="button"
      onClick={() => onOpen(id)}
      className="flex w-full items-center gap-2 rounded border border-slate-200 px-3 py-2 text-left hover:bg-slate-50 dark:border-slate-700 dark:hover:bg-slate-800"
    >
      <Database className="h-4 w-4 shrink-0 text-slate-400" />
      <span className="min-w-0 flex-1 truncate text-sm">{name}</span>
      <span className="text-xs text-slate-400">
        {t("db.rowCount", { count: rowCount })}
      </span>
      <Plus className="h-4 w-4 rotate-45 text-transparent" />
    </button>
  );
}
