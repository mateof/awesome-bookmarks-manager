import {
  OPS_BY_KIND,
  type DatabaseDetail,
  type DbView,
  type Filter,
  type FilterOp,
  type Sort,
} from "@awesome-bookmarks/shared";
import { useMutation } from "@tanstack/react-query";
import { Eye, EyeOff, Plus, Trash2 } from "lucide-react";
import { useState } from "react";
import { useTranslation } from "react-i18next";
import { api } from "../api.js";
import { Modal } from "./Modal.js";

/** Operators that need no value: asking for one would be a box you must leave blank. */
const NO_VALUE: FilterOp[] = ["isEmpty", "isNotEmpty"];

/**
 * Filters, sorting, grouping and which columns show.
 *
 * All of it lives on the view, never on the data. Two views over the same rows
 * are the whole point of the component; a filter that deleted rows, or a sort
 * that renumbered them, would make the second view a lie.
 */
export function ViewSettings({
  db,
  view,
  tab,
  onClose,
  onChanged,
}: {
  db: DatabaseDetail;
  view: DbView;
  tab: "filters" | "sorts";
  onClose: () => void;
  onChanged: () => void;
}) {
  const { t } = useTranslation();
  const [filters, setFilters] = useState<Filter[]>(view.config.filters);
  const [sorts, setSorts] = useState<Sort[]>(view.config.sorts);
  const [hidden, setHidden] = useState<string[]>(view.config.hiddenColumnIds);
  const [groupBy, setGroupBy] = useState<string | null>(
    view.config.groupByColumnId,
  );
  const [titleCol, setTitleCol] = useState<string | null>(
    view.config.titleColumnId,
  );

  const selectColumns = db.columns.filter((c) => c.kind === "select");

  const save = useMutation({
    mutationFn: () =>
      api.updateDbView(db.id, view.id, {
        config: {
          filters,
          sorts,
          hiddenColumnIds: hidden,
          groupByColumnId: groupBy,
          titleColumnId: titleCol,
        },
      }),
    onSuccess: () => {
      onChanged();
      onClose();
    },
  });

  const columnById = (id: string) => db.columns.find((c) => c.id === id);

  return (
    <Modal title={t("db.viewSettings", { name: view.name })} onClose={onClose} size="lg">
      <div className="space-y-4">
        {tab === "filters" ? (
          <section className="space-y-2">
            <h3 className="text-xs font-medium uppercase text-slate-500">
              {t("db.filters")}
            </h3>
            {filters.length === 0 && (
              <p className="text-xs text-slate-400">{t("db.noFilters")}</p>
            )}
            {filters.map((f, i) => {
              const col = columnById(f.columnId);
              const ops = col ? OPS_BY_KIND[col.kind] : [];
              return (
                <div key={i} className="flex flex-wrap items-center gap-2">
                  <select
                    value={f.columnId}
                    aria-label={t("db.filterColumn")}
                    onChange={(e) => {
                      const next = db.columns.find((c) => c.id === e.target.value);
                      setFilters((prev) =>
                        prev.map((x, j) =>
                          j === i
                            ? {
                                columnId: e.target.value,
                                // The operator has to be one the new column
                                // actually supports, or the filter silently
                                // stops matching anything.
                                op: next ? (OPS_BY_KIND[next.kind][0] as FilterOp) : x.op,
                                value: undefined,
                              }
                            : x,
                        ),
                      );
                    }}
                    className="rounded border border-slate-300 px-2 py-1 text-sm dark:border-slate-700 dark:bg-slate-800"
                  >
                    {db.columns.map((c) => (
                      <option key={c.id} value={c.id}>
                        {c.name}
                      </option>
                    ))}
                  </select>

                  <select
                    value={f.op}
                    aria-label={t("db.filterOp")}
                    onChange={(e) =>
                      setFilters((prev) =>
                        prev.map((x, j) =>
                          j === i ? { ...x, op: e.target.value as FilterOp } : x,
                        ),
                      )
                    }
                    className="rounded border border-slate-300 px-2 py-1 text-sm dark:border-slate-700 dark:bg-slate-800"
                  >
                    {ops.map((op) => (
                      <option key={op} value={op}>
                        {t(`db.op.${op}` as "db.op.contains")}
                      </option>
                    ))}
                  </select>

                  {!NO_VALUE.includes(f.op) &&
                    (col?.kind === "select" || col?.kind === "multiSelect" ? (
                      <select
                        value={typeof f.value === "string" ? f.value : ""}
                        aria-label={t("db.filterValue")}
                        onChange={(e) =>
                          setFilters((prev) =>
                            prev.map((x, j) =>
                              j === i ? { ...x, value: e.target.value } : x,
                            ),
                          )
                        }
                        className="rounded border border-slate-300 px-2 py-1 text-sm dark:border-slate-700 dark:bg-slate-800"
                      >
                        <option value="">—</option>
                        {col.config.options.map((o) => (
                          <option key={o.id} value={o.id}>
                            {o.name}
                          </option>
                        ))}
                      </select>
                    ) : col?.kind === "checkbox" ? (
                      <select
                        value={f.value === true ? "true" : "false"}
                        aria-label={t("db.filterValue")}
                        onChange={(e) =>
                          setFilters((prev) =>
                            prev.map((x, j) =>
                              j === i
                                ? { ...x, value: e.target.value === "true" }
                                : x,
                            ),
                          )
                        }
                        className="rounded border border-slate-300 px-2 py-1 text-sm dark:border-slate-700 dark:bg-slate-800"
                      >
                        <option value="true">{t("db.checked")}</option>
                        <option value="false">{t("db.unchecked")}</option>
                      </select>
                    ) : (
                      <input
                        value={
                          f.value === undefined || f.value === null
                            ? ""
                            : String(f.value)
                        }
                        aria-label={t("db.filterValue")}
                        type={col?.kind === "date" ? "date" : "text"}
                        onChange={(e) =>
                          setFilters((prev) =>
                            prev.map((x, j) =>
                              j === i ? { ...x, value: e.target.value } : x,
                            ),
                          )
                        }
                        className="rounded border border-slate-300 px-2 py-1 text-sm dark:border-slate-700 dark:bg-slate-800"
                      />
                    ))}

                  <button
                    type="button"
                    onClick={() =>
                      setFilters((prev) => prev.filter((_, j) => j !== i))
                    }
                    title={t("common.delete")}
                    aria-label={t("db.removeFilter")}
                    className="rounded p-1 text-slate-400 hover:text-red-600"
                  >
                    <Trash2 className="h-4 w-4" />
                  </button>
                </div>
              );
            })}
            <button
              type="button"
              disabled={db.columns.length === 0}
              onClick={() => {
                const col = db.columns[0];
                if (!col) return;
                setFilters((prev) => [
                  ...prev,
                  { columnId: col.id, op: OPS_BY_KIND[col.kind][0] as FilterOp },
                ]);
              }}
              className="flex items-center gap-1 rounded border border-slate-300 px-2 py-1 text-xs dark:border-slate-700"
            >
              <Plus className="h-3 w-3" />
              {t("db.addFilter")}
            </button>
          </section>
        ) : (
          <section className="space-y-2">
            <h3 className="text-xs font-medium uppercase text-slate-500">
              {t("db.sorts")}
            </h3>
            {sorts.length === 0 && (
              <p className="text-xs text-slate-400">{t("db.noSorts")}</p>
            )}
            {sorts.map((s, i) => (
              <div key={i} className="flex items-center gap-2">
                <select
                  value={s.columnId}
                  aria-label={t("db.sortColumn")}
                  onChange={(e) =>
                    setSorts((prev) =>
                      prev.map((x, j) =>
                        j === i ? { ...x, columnId: e.target.value } : x,
                      ),
                    )
                  }
                  className="rounded border border-slate-300 px-2 py-1 text-sm dark:border-slate-700 dark:bg-slate-800"
                >
                  {db.columns.map((c) => (
                    <option key={c.id} value={c.id}>
                      {c.name}
                    </option>
                  ))}
                </select>
                <select
                  value={s.direction}
                  aria-label={t("db.sortDirection")}
                  onChange={(e) =>
                    setSorts((prev) =>
                      prev.map((x, j) =>
                        j === i
                          ? { ...x, direction: e.target.value as "asc" | "desc" }
                          : x,
                      ),
                    )
                  }
                  className="rounded border border-slate-300 px-2 py-1 text-sm dark:border-slate-700 dark:bg-slate-800"
                >
                  <option value="asc">{t("db.asc")}</option>
                  <option value="desc">{t("db.desc")}</option>
                </select>
                <button
                  type="button"
                  onClick={() => setSorts((prev) => prev.filter((_, j) => j !== i))}
                  title={t("common.delete")}
                  aria-label={t("db.removeSort")}
                  className="rounded p-1 text-slate-400 hover:text-red-600"
                >
                  <Trash2 className="h-4 w-4" />
                </button>
              </div>
            ))}
            <button
              type="button"
              disabled={db.columns.length === 0}
              onClick={() => {
                const col = db.columns[0];
                if (!col) return;
                setSorts((prev) => [
                  ...prev,
                  { columnId: col.id, direction: "asc" },
                ]);
              }}
              className="flex items-center gap-1 rounded border border-slate-300 px-2 py-1 text-xs dark:border-slate-700"
            >
              <Plus className="h-3 w-3" />
              {t("db.addSort")}
            </button>
          </section>
        )}

        <section className="space-y-2">
          <h3 className="text-xs font-medium uppercase text-slate-500">
            {t("db.columns")}
          </h3>
          <div className="flex flex-wrap gap-1">
            {db.columns.map((c) => {
              const off = hidden.includes(c.id);
              return (
                <button
                  key={c.id}
                  type="button"
                  onClick={() =>
                    setHidden((prev) =>
                      off ? prev.filter((x) => x !== c.id) : [...prev, c.id],
                    )
                  }
                  aria-pressed={!off}
                  className={`flex items-center gap-1 rounded border px-2 py-1 text-xs ${
                    off
                      ? "border-slate-200 text-slate-400 dark:border-slate-800"
                      : "border-slate-300 dark:border-slate-600"
                  }`}
                >
                  {off ? <EyeOff className="h-3 w-3" /> : <Eye className="h-3 w-3" />}
                  {c.name}
                </button>
              );
            })}
          </div>
        </section>

        {(view.kind === "board" || view.kind === "gallery") && (
          <section className="grid gap-3 sm:grid-cols-2">
            {view.kind === "board" && (
              <label className="block">
                <span className="mb-1 block text-xs font-medium text-slate-500">
                  {t("db.groupBy")}
                </span>
                <select
                  value={groupBy ?? ""}
                  onChange={(e) => setGroupBy(e.target.value || null)}
                  className="w-full rounded border border-slate-300 px-2 py-1 text-sm dark:border-slate-700 dark:bg-slate-800"
                >
                  <option value="">{t("db.pickColumn")}</option>
                  {selectColumns.map((c) => (
                    <option key={c.id} value={c.id}>
                      {c.name}
                    </option>
                  ))}
                </select>
                {selectColumns.length === 0 && (
                  <span className="mt-1 block text-xs text-slate-400">
                    {t("db.needsSelect")}
                  </span>
                )}
              </label>
            )}
            <label className="block">
              <span className="mb-1 block text-xs font-medium text-slate-500">
                {t("db.cardTitle")}
              </span>
              <select
                value={titleCol ?? ""}
                onChange={(e) => setTitleCol(e.target.value || null)}
                className="w-full rounded border border-slate-300 px-2 py-1 text-sm dark:border-slate-700 dark:bg-slate-800"
              >
                <option value="">{t("db.pickColumn")}</option>
                {db.columns.map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.name}
                  </option>
                ))}
              </select>
            </label>
          </section>
        )}

        <div className="flex justify-end gap-2">
          <button
            type="button"
            onClick={onClose}
            className="rounded border border-slate-300 px-3 py-1.5 text-sm dark:border-slate-700"
          >
            {t("common.cancel")}
          </button>
          <button
            type="button"
            disabled={save.isPending}
            onClick={() => save.mutate()}
            className="rounded bg-slate-900 px-4 py-1.5 text-sm text-white disabled:opacity-50 dark:bg-slate-100 dark:text-slate-900"
          >
            {t("common.save")}
          </button>
        </div>
      </div>
    </Modal>
  );
}
