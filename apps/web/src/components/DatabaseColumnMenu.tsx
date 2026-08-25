import {
  ColumnKindSchema,
  OPTION_COLORS,
  type ColumnKind,
  type DbColumn,
  type SelectOption,
} from "@awesome-bookmarks/shared";
import { useMutation } from "@tanstack/react-query";
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
  onClose,
  onChanged,
}: {
  databaseId: string;
  /** Null when adding a new column. */
  column: DbColumn | null;
  /** All of them, in their current order, for the move buttons. */
  columns: DbColumn[];
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

  const wantsOptions = kind === "select" || kind === "multiSelect";

  const save = useMutation({
    mutationFn: async () => {
      const config = wantsOptions ? { options } : {};
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
