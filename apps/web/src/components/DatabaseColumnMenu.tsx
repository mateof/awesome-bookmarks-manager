import {
  aggregatesFor,
  ColumnKindSchema,
  OPTION_COLORS,
  type Aggregate,
  type ColumnKind,
  type DbColumn,
  type SelectOption,
} from "@awesome-bookmarks/shared";
import { useMutation, useQuery } from "@tanstack/react-query";
import { ArrowLeft, ArrowRight, Plus, Trash2 } from "lucide-react";
import { useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import { api } from "../api.js";
import { AnchoredPopover } from "./AnchoredPopover.js";
import { newOption, OptionChip } from "./DatabaseCell.js";
import { dlg } from "./dialogs.js";
import { Modal } from "./Modal.js";

const KINDS = ColumnKindSchema.options;

/**
 * One option: its chip, a palette to recolour it, and a bin.
 *
 * The chip itself opens the palette. An option is a coloured pill and nothing
 * else, so the pill is the obvious thing to click when the colour is what you
 * want to change; a separate swatch button next to it would be a second target
 * for the same idea.
 */
function OptionRow({
  option,
  onColor,
  onDelete,
}: {
  option: SelectOption;
  onColor: (color: string) => void;
  onDelete: () => void;
}) {
  const { t } = useTranslation();
  const [picking, setPicking] = useState(false);
  const anchor = useRef<HTMLSpanElement>(null);

  return (
    <span ref={anchor} className="flex items-center gap-1">
      <button
        type="button"
        onClick={() => setPicking((v) => !v)}
        title={t("db.optionColor")}
        aria-label={`${t("db.optionColor")}: ${option.name}`}
        className="rounded-full focus:outline-none focus:ring-2 focus:ring-sky-500"
      >
        <OptionChip option={option} />
      </button>
      <button
        type="button"
        onClick={onDelete}
        title={t("common.delete")}
        aria-label={`${t("common.delete")}: ${option.name}`}
        className="rounded p-0.5 text-slate-400 hover:text-red-600"
      >
        <Trash2 className="h-3 w-3" />
      </button>

      {picking && (
        <AnchoredPopover
          anchor={anchor}
          onClose={() => setPicking(false)}
          width={232}
        >
          <span className="flex flex-wrap items-center gap-1 p-1">
            {OPTION_COLORS.map((c) => (
              <button
                key={c}
                type="button"
                aria-label={c}
                onClick={() => {
                  onColor(c);
                  setPicking(false);
                }}
                className={`h-5 w-5 rounded-full ring-1 ring-black/10 ${
                  c.toLowerCase() === option.color.toLowerCase()
                    ? "ring-2 ring-slate-900 dark:ring-slate-100"
                    : ""
                }`}
                style={{ backgroundColor: c }}
              />
            ))}
          </span>
        </AnchoredPopover>
      )}
    </span>
  );
}

/**
 * Add a column, or change, move and delete an existing one.
 *
 * A column's kind is fixed once it exists. Changing it would have to decide
 * what a date becomes when it turns into a checkbox, and every answer to that
 * is either wrong or destroys data silently; deleting and adding is explicit
 * about what happens.
 */
export function ColumnMenu({
  databaseId,
  column,
  columns,
  aggregate,
  onAggregate,
  onClose,
  onChanged,
}: {
  databaseId: string;
  /** Null when adding a new column. */
  column: DbColumn | null;
  /** All of them, in their current order, for the move buttons. */
  columns: DbColumn[];
  /** What this column's footer says today, in the active view. */
  aggregate: Aggregate;
  onAggregate: (op: Aggregate) => void;
  onClose: () => void;
  onChanged: () => void;
}) {
  const { t } = useTranslation();
  const [name, setName] = useState(column?.name ?? "");
  const [kind, setKind] = useState<ColumnKind>(column?.kind ?? "text");
  const [options, setOptions] = useState<SelectOption[]>(
    column?.config.options ?? [],
  );
  const [optionDraft, setOptionDraft] = useState("");
  const [err, setErr] = useState<string | null>(null);
  const [formula, setFormula] = useState(column?.config.formula ?? "");
  const [targetDb, setTargetDb] = useState(
    column?.config.targetDatabaseId ?? "",
  );
  const [relationCol, setRelationCol] = useState(
    column?.config.relationColumnId ?? "",
  );
  const [targetCol, setTargetCol] = useState(column?.config.targetColumnId ?? "");
  const [rollupOp, setRollupOp] = useState(column?.config.rollupOp ?? "count");

  const wantsOptions = kind === "select" || kind === "multiSelect";

  // The other tables, for a relation to point at. Only fetched when the kind
  // being edited actually needs them.
  const others = useQuery({
    queryKey: ["databases"],
    queryFn: () => api.listDatabases(),
    enabled: kind === "relation",
    staleTime: 30_000,
  });

  // The relation columns of *this* table, and the columns of whatever they
  // point at: a rollup is "follow that link, then summarise that column".
  const relationColumns = columns.filter((c) => c.kind === "relation");
  const rollupTargetId = relationColumns.find((c) => c.id === relationCol)
    ?.config.targetDatabaseId;
  const rollupTarget = useQuery({
    queryKey: ["database", rollupTargetId ?? "none", null],
    queryFn: () => api.getDatabase(rollupTargetId!),
    enabled: kind === "rollup" && !!rollupTargetId,
    staleTime: 30_000,
  });

  const save = useMutation({
    mutationFn: async () => {
      const config = wantsOptions
        ? { options }
        : kind === "formula"
          ? { formula }
          : kind === "relation"
            ? { targetDatabaseId: targetDb || undefined }
            : kind === "rollup"
              ? {
                  relationColumnId: relationCol || undefined,
                  targetColumnId: targetCol || undefined,
                  rollupOp,
                }
              : {};
      if (column) {
        await api.updateDbColumn(databaseId, column.id, {
          name: name.trim() || column.name,
          config,
        });
      } else {
        await api.addDbColumn(databaseId, {
          kind,
          name: name.trim() || t("db.newColumn"),
          config,
        });
      }
    },
    onSuccess: () => {
      onChanged();
      onClose();
    },
    onError: (e) => setErr(e instanceof Error ? e.message : String(e)),
  });

  const remove = useMutation({
    mutationFn: () => api.deleteDbColumn(databaseId, column!.id),
    onSuccess: () => {
      onChanged();
      onClose();
    },
  });

  /**
   * Move by one place, either way.
   *
   * The dragging is in the table header, where the gesture belongs. This is the
   * same move without a mouse: reachable by keyboard, and it says out loud
   * which direction it goes, which a drag never does. It applies at once rather
   * than on Save, because a position is not a draft the way a name is.
   */
  const at = column ? columns.findIndex((c) => c.id === column.id) : -1;
  const move = useMutation({
    mutationFn: (delta: number) => {
      const order = columns.map((c) => c.id);
      const [moved] = order.splice(at, 1);
      order.splice(at + delta, 0, moved!);
      return api.reorderDbColumns(databaseId, order);
    },
    onSuccess: () => onChanged(),
    onError: (e) => setErr(e instanceof Error ? e.message : String(e)),
  });

  return (
    <Modal
      title={column ? t("db.editColumn", { name: column.name }) : t("db.addColumn")}
      onClose={onClose}
      size="md"
    >
      <div className="space-y-3">
        <label className="block">
          <span className="mb-1 block text-xs font-medium text-slate-500">
            {t("db.columnName")}
          </span>
          <input
            value={name}
            aria-label={t("db.columnName")}
            autoFocus
            onChange={(e) => setName(e.target.value)}
            className="w-full rounded border border-slate-300 px-2 py-1.5 text-sm dark:border-slate-700 dark:bg-slate-800"
          />
        </label>

        <label className="block">
          <span className="mb-1 block text-xs font-medium text-slate-500">
            {t("db.columnKind")}
          </span>
          <select
            value={kind}
            aria-label={t("db.columnKind")}
            disabled={!!column}
            onChange={(e) => setKind(e.target.value as ColumnKind)}
            className="w-full rounded border border-slate-300 px-2 py-1.5 text-sm disabled:opacity-60 dark:border-slate-700 dark:bg-slate-800"
          >
            {KINDS.map((k) => (
              <option key={k} value={k}>
                {t(`db.kind.${k}` as "db.kind.text")}
              </option>
            ))}
          </select>
          {column && (
            <span className="mt-1 block text-xs text-slate-400">
              {t("db.kindFixed")}
            </span>
          )}
        </label>

        {/* The footer of a column belongs to the view, not to the column, but
            this is where somebody goes looking for "what does this column add
            up to". The footer itself can change it too, once it is there. */}
        {column && (
          <label className="block">
            <span className="mb-1 block text-xs font-medium text-slate-500">
              {t("db.summary")}
            </span>
            <select
              value={aggregate}
              aria-label={t("db.summary")}
              onChange={(e) => onAggregate(e.target.value as Aggregate)}
              className="w-full rounded border border-slate-300 px-2 py-1.5 text-sm dark:border-slate-700 dark:bg-slate-800"
            >
              {aggregatesFor(column.kind).map((op) => (
                <option key={op} value={op}>
                  {t(`db.agg.${op}` as "db.agg.count")}
                </option>
              ))}
            </select>
          </label>
        )}

        {column && columns.length > 1 && (
          <div>
            <span className="mb-1 block text-xs font-medium text-slate-500">
              {t("db.columnPosition", { at: at + 1, total: columns.length })}
            </span>
            <div className="flex gap-2">
              <button
                type="button"
                disabled={at <= 0 || move.isPending}
                onClick={() => move.mutate(-1)}
                className="flex items-center gap-1 rounded border border-slate-300 px-2 py-1 text-sm disabled:opacity-40 dark:border-slate-700"
              >
                <ArrowLeft className="h-3.5 w-3.5" />
                {t("db.moveLeft")}
              </button>
              <button
                type="button"
                disabled={at < 0 || at >= columns.length - 1 || move.isPending}
                onClick={() => move.mutate(1)}
                className="flex items-center gap-1 rounded border border-slate-300 px-2 py-1 text-sm disabled:opacity-40 dark:border-slate-700"
              >
                {t("db.moveRight")}
                <ArrowRight className="h-3.5 w-3.5" />
              </button>
            </div>
          </div>
        )}

        {kind === "formula" && (
          <label className="block">
            <span className="mb-1 block text-xs font-medium text-slate-500">
              {t("db.formula")}
            </span>
            <textarea
              value={formula}
              aria-label={t("db.formula")}
              rows={2}
              onChange={(e) => setFormula(e.target.value)}
              className="w-full rounded border border-slate-300 px-2 py-1.5 font-mono text-sm dark:border-slate-700 dark:bg-slate-800"
            />
            <span className="mt-1 block text-xs text-slate-400">
              {t("db.formulaHelp")}
            </span>
          </label>
        )}

        {kind === "relation" && (
          <label className="block">
            <span className="mb-1 block text-xs font-medium text-slate-500">
              {t("db.relationTarget")}
            </span>
            <select
              value={targetDb}
              aria-label={t("db.relationTarget")}
              onChange={(e) => setTargetDb(e.target.value)}
              className="w-full rounded border border-slate-300 px-2 py-1.5 text-sm dark:border-slate-700 dark:bg-slate-800"
            >
              <option value="">{t("db.pickColumn")}</option>
              {(others.data ?? [])
                .filter((d) => d.id !== databaseId)
                .map((d) => (
                  <option key={d.id} value={d.id}>
                    {d.name}
                  </option>
                ))}
            </select>
          </label>
        )}

        {kind === "rollup" && (
          <div className="grid gap-2 sm:grid-cols-3">
            <label className="block">
              <span className="mb-1 block text-xs font-medium text-slate-500">
                {t("db.rollupRelation")}
              </span>
              <select
                value={relationCol}
                aria-label={t("db.rollupRelation")}
                onChange={(e) => setRelationCol(e.target.value)}
                className="w-full rounded border border-slate-300 px-2 py-1.5 text-sm dark:border-slate-700 dark:bg-slate-800"
              >
                <option value="">{t("db.pickColumn")}</option>
                {relationColumns.map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.name}
                  </option>
                ))}
              </select>
            </label>
            <label className="block">
              <span className="mb-1 block text-xs font-medium text-slate-500">
                {t("db.rollupTarget")}
              </span>
              <select
                value={targetCol}
                aria-label={t("db.rollupTarget")}
                onChange={(e) => setTargetCol(e.target.value)}
                className="w-full rounded border border-slate-300 px-2 py-1.5 text-sm dark:border-slate-700 dark:bg-slate-800"
              >
                <option value="">{t("db.pickColumn")}</option>
                {(rollupTarget.data?.columns ?? []).map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.name}
                  </option>
                ))}
              </select>
            </label>
            <label className="block">
              <span className="mb-1 block text-xs font-medium text-slate-500">
                {t("db.rollupOp")}
              </span>
              <select
                value={rollupOp}
                aria-label={t("db.rollupOp")}
                onChange={(e) =>
                  setRollupOp(e.target.value as typeof rollupOp)
                }
                className="w-full rounded border border-slate-300 px-2 py-1.5 text-sm dark:border-slate-700 dark:bg-slate-800"
              >
                <option value="count">{t("db.agg.count")}</option>
                <option value="sum">{t("db.agg.sum")}</option>
                <option value="avg">{t("db.agg.avg")}</option>
                <option value="min">{t("db.agg.min")}</option>
                <option value="max">{t("db.agg.max")}</option>
                <option value="list">{t("db.rollupList")}</option>
              </select>
            </label>
          </div>
        )}

        {wantsOptions && (
          <div>
            <span className="mb-1 block text-xs font-medium text-slate-500">
              {t("db.options")}
            </span>
            <div className="mb-2 flex flex-wrap gap-1">
              {options.map((o) => (
                <OptionRow
                  key={o.id}
                  option={o}
                  onColor={(color) =>
                    setOptions((prev) =>
                      prev.map((x) => (x.id === o.id ? { ...x, color } : x)),
                    )
                  }
                  onDelete={() =>
                    setOptions((prev) => prev.filter((x) => x.id !== o.id))
                  }
                />
              ))}
              {options.length === 0 && (
                <span className="text-xs text-slate-400">{t("db.noOptions")}</span>
              )}
            </div>
            <div className="flex gap-2">
              <input
                value={optionDraft}
                onChange={(e) => setOptionDraft(e.target.value)}
                placeholder={t("db.newOption")}
                onKeyDown={(e) => {
                  if (e.key !== "Enter") return;
                  e.preventDefault();
                  const v = optionDraft.trim();
                  if (!v) return;
                  setOptions((prev) => [...prev, newOption(v, prev)]);
                  setOptionDraft("");
                }}
                className="flex-1 rounded border border-slate-300 px-2 py-1.5 text-sm dark:border-slate-700 dark:bg-slate-800"
              />
              <button
                type="button"
                onClick={() => {
                  const v = optionDraft.trim();
                  if (!v) return;
                  setOptions((prev) => [...prev, newOption(v, prev)]);
                  setOptionDraft("");
                }}
                className="rounded border border-slate-300 px-2 text-sm dark:border-slate-700"
              >
                <Plus className="h-4 w-4" />
              </button>
            </div>
          </div>
        )}

        {err && <div className="text-sm text-red-600">{err}</div>}

        <div className="flex items-center justify-end gap-2">
          {column && (
            <button
              type="button"
              onClick={async () => {
                if (
                  await dlg.confirm({
                    message: t("db.confirmDeleteColumn", { name: column.name }),
                    danger: true,
                  })
                )
                  remove.mutate();
              }}
              className="mr-auto rounded border border-red-300 px-3 py-1.5 text-sm text-red-600 dark:border-red-800"
            >
              {t("common.delete")}
            </button>
          )}
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
