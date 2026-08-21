import {
  ColumnKindSchema,
  type ColumnKind,
  type DbColumn,
  type SelectOption,
} from "@awesome-bookmarks/shared";
import { useMutation } from "@tanstack/react-query";
import { Plus, Trash2 } from "lucide-react";
import { useState } from "react";
import { useTranslation } from "react-i18next";
import { api } from "../api.js";
import { newOption, OptionChip } from "./DatabaseCell.js";
import { dlg } from "./dialogs.js";
import { Modal } from "./Modal.js";

const KINDS = ColumnKindSchema.options;

/**
 * Add a column, or change and delete an existing one.
 *
 * A column's kind is fixed once it exists. Changing it would have to decide
 * what a date becomes when it turns into a checkbox, and every answer to that
 * is either wrong or destroys data silently; deleting and adding is explicit
 * about what happens.
 */
export function ColumnMenu({
  databaseId,
  column,
  onClose,
  onChanged,
}: {
  databaseId: string;
  /** Null when adding a new column. */
  column: DbColumn | null;
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

        {wantsOptions && (
          <div>
            <span className="mb-1 block text-xs font-medium text-slate-500">
              {t("db.options")}
            </span>
            <div className="mb-2 flex flex-wrap gap-1">
              {options.map((o) => (
                <span key={o.id} className="flex items-center gap-1">
                  <OptionChip option={o} />
                  <button
                    type="button"
                    onClick={() =>
                      setOptions((prev) => prev.filter((x) => x.id !== o.id))
                    }
                    title={t("common.delete")}
                    aria-label={`${t("common.delete")}: ${o.name}`}
                    className="rounded p-0.5 text-slate-400 hover:text-red-600"
                  >
                    <Trash2 className="h-3 w-3" />
                  </button>
                </span>
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
                  setOptions((prev) => [...prev, newOption(v, prev.length)]);
                  setOptionDraft("");
                }}
                className="flex-1 rounded border border-slate-300 px-2 py-1.5 text-sm dark:border-slate-700 dark:bg-slate-800"
              />
              <button
                type="button"
                onClick={() => {
                  const v = optionDraft.trim();
                  if (!v) return;
                  setOptions((prev) => [...prev, newOption(v, prev.length)]);
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
