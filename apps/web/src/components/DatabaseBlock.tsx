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
import { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import { api } from "../api.js";
import { DatabaseBoard, DatabaseGallery } from "./DatabaseBoard.js";
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
  blockId,
  pinnedViewId,
  readOnly = false,
}: {
  databaseId: string;
  /** Written into the note, so the card has a name before anything loads. */
  fallbackName?: string;
  /**
   * Identity of this embed. Views created here belong to it alone, so the same
   * table embedded in two notes can be looked at two ways.
   */
  blockId?: string | null;
  /**
   * When set, this embed shows one view and no tab strip: an embedded table is
   * usually meant to be one table rather than a switcher.
   */
  pinnedViewId?: string | null;
  readOnly?: boolean;
}) {
  const { t } = useTranslation();
  const qc = useQueryClient();
  const key = ["database", databaseId, blockId ?? null];
  const [activeViewId, setActiveViewId] = useState<string | null>(null);
  const [renaming, setRenaming] = useState(false);
  const [draftName, setDraftName] = useState("");

  const { data: db, isError } = useQuery({
    queryKey: key,
    queryFn: () => api.getDatabase(databaseId, blockId),
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
    // `seed` lets the board put a new card straight into the lane it was added
    // from, instead of dropping it in "unassigned" for the user to move.
    mutationFn: (seed: Record<string, CellValue> = {}) => {
      const cells: Record<string, CellValue> = {};
      for (const c of db?.columns ?? []) cells[c.id] = emptyValue(c.kind);
      return api.addDbRow(databaseId, { ...cells, ...seed });
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

  const rename = useMutation({
    mutationFn: (name: string) => api.renameDatabase(databaseId, name),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: key });
      qc.invalidateQueries({ queryKey: ["databases"] });
    },
  });

  // Keep the draft in step with the server, except while it is being typed in.
  useEffect(() => {
    if (!renaming && db?.name) setDraftName(db.name);
  }, [db?.name, renaming]);

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

  // A pinned embed shows exactly its view. Falling back to the first one when
  // the pinned view has been deleted beats rendering nothing.
  const pinned = pinnedViewId
    ? (db.views.find((v) => v.id === pinnedViewId) ?? null)
    : null;
  const view =
    pinned ??
    db.views.find((v) => v.id === activeViewId) ??
    db.views[0] ??
    null;
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
        {renaming && !readOnly ? (
          <input
            value={draftName}
            autoFocus
            aria-label={t("db.renameDatabase")}
            onChange={(e) => setDraftName(e.target.value)}
            onBlur={() => {
              setRenaming(false);
              const next = draftName.trim();
              if (next && next !== db.name) rename.mutate(next);
            }}
            onKeyDown={(e) => {
              if (e.key === "Enter") (e.target as HTMLInputElement).blur();
              if (e.key === "Escape") {
                setDraftName(db.name);
                setRenaming(false);
              }
            }}
            className="min-w-0 flex-1 rounded border border-slate-300 px-1 py-0.5 text-sm dark:border-slate-600 dark:bg-slate-800"
          />
        ) : (
          <button
            type="button"
            disabled={readOnly}
            onClick={() => setRenaming(true)}
            title={readOnly ? undefined : t("db.renameDatabase")}
            className="min-w-0 flex-1 truncate text-left text-sm font-medium disabled:cursor-default hover:underline"
          >
            {db.name}
          </button>
        )}
        <span className="shrink-0 text-xs text-slate-400">
          {t("db.rowCount", { count: db.rows.length })}
        </span>
      </div>

      {view && (
        <ViewBar
          db={db}
          view={view}
          blockId={blockId ?? null}
          pinned={!!pinned}
          readOnly={readOnly}
          onSelect={setActiveViewId}
          onChanged={refresh}
        />
      )}

      {/* The table's own ceiling: uncapping the note means a five hundred row
          table would otherwise run down the page forever. */}
      <div className="max-h-[70vh] overflow-auto p-2">
        {renderView(view?.kind ?? "table")}
      </div>
    </div>
  );

  function renderView(kind: ViewKind) {
    const onCell = (rowId: string, columnId: string, value: CellValue) =>
      cell.mutate({ rowId, columnId, value });

    if (kind === "board") {
      return (
        <DatabaseBoard
          db={shown}
          rows={rows}
          config={config}
          readOnly={readOnly}
          onCell={onCell}
          onAddRow={(seed) => addRow.mutate(seed)}
        />
      );
    }
    if (kind === "gallery") {
      return (
        <DatabaseGallery
          db={shown}
          rows={rows}
          config={config}
          readOnly={readOnly}
          onCell={onCell}
          onAddRow={(seed) => addRow.mutate(seed)}
        />
      );
    }
    return (
      <DatabaseTable
        db={shown}
        rows={rows}
        readOnly={readOnly}
        onCell={onCell}
        onAddRow={() => addRow.mutate({})}
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
