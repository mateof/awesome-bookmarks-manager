import {
  AUTOFILL_KEY_PATTERN,
  type AutofillVariable,
} from "@awesome-bookmarks/shared";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  ArrowDown,
  ArrowUp,
  ChevronLeft,
  ChevronRight,
  Eye,
  EyeOff,
  PencilLine,
  Plus,
  Search,
  Trash2,
} from "lucide-react";
import { useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import { api } from "../api.js";
import { notifyAutomationsChanged } from "../lib/extensionBridge.js";
import { dlg } from "./dialogs.js";
import { Modal } from "./Modal.js";

const inputCls =
  "w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm outline-none transition focus:border-slate-400 focus:ring-2 focus:ring-slate-200 dark:border-slate-700 dark:bg-slate-800 dark:focus:ring-slate-700/50";
const selectCls =
  "rounded-lg border border-slate-300 bg-white px-2 py-2 text-sm outline-none dark:border-slate-700 dark:bg-slate-800";
const btnPrimary =
  "inline-flex items-center gap-1.5 rounded-lg bg-slate-900 px-3.5 py-2 text-sm font-medium text-white transition hover:bg-slate-800 disabled:opacity-50 dark:bg-slate-100 dark:text-slate-900 dark:hover:bg-white";
const btnSecondary =
  "inline-flex items-center gap-1.5 rounded-lg border border-slate-300 px-3.5 py-2 text-sm transition hover:bg-slate-100 disabled:opacity-50 dark:border-slate-700 dark:hover:bg-slate-800";
const iconBtn =
  "rounded p-1.5 text-slate-500 hover:bg-slate-100 hover:text-slate-900 dark:hover:bg-slate-800 dark:hover:text-slate-100";

const PRESETS = [
  "nombre",
  "apellidos",
  "dni",
  "email",
  "telefono",
  "direccion",
  "codigo_postal",
  "localidad",
  "fecha_nacimiento",
] as const;

const PAGE_SIZES = [10, 25, 50] as const;

type SortKey = "label" | "key";
type ValueFilter = "all" | "filled" | "empty";
type UsageFilter = "all" | "used" | "unused";

export function slugifyKey(label: string): string {
  const slug = label
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "_")
    .replace(/^_+|_+$/g, "")
    .replace(/^[^a-z]+/, "")
    .slice(0, 40);
  return slug || "variable";
}

const fold = (v: string) =>
  v.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase();

export function AutofillVariablesEditor() {
  const { t } = useTranslation();
  const qc = useQueryClient();
  const variables = useQuery({
    queryKey: ["autofill-variables"],
    queryFn: api.listAutofillVariables,
  });
  const usageQ = useQuery({
    queryKey: ["autofill-variable-usage"],
    queryFn: api.autofillVariableUsage,
  });
  const usage = usageQ.data ?? {};

  const [search, setSearch] = useState("");
  const [valueFilter, setValueFilter] = useState<ValueFilter>("all");
  const [usageFilter, setUsageFilter] = useState<UsageFilter>("all");
  const [sort, setSort] = useState<{ key: SortKey; desc: boolean }>({
    key: "label",
    desc: false,
  });
  const [pageSize, setPageSize] = useState<number>(10);
  const [page, setPage] = useState(0);
  const [revealed, setRevealed] = useState<Set<string>>(new Set());
  const [editing, setEditing] = useState<AutofillVariable | "new" | null>(null);

  const save = useMutation({
    mutationFn: (list: AutofillVariable[]) => api.saveAutofillVariables(list),
    onSuccess: (saved) => {
      qc.setQueryData(["autofill-variables"], saved);
      qc.invalidateQueries({ queryKey: ["automation"] });
      qc.invalidateQueries({ queryKey: ["autofill-variable-usage"] });
      notifyAutomationsChanged();
    },
  });

  const all = variables.data ?? [];
  const rows = useMemo(() => {
    const needle = fold(search.trim());
    const filtered = all.filter((v) => {
      if (valueFilter === "filled" && v.value === "") return false;
      if (valueFilter === "empty" && v.value !== "") return false;
      const used = (usage[v.key] ?? 0) > 0;
      if (usageFilter === "used" && !used) return false;
      if (usageFilter === "unused" && used) return false;
      if (!needle) return true;
      return [v.label, v.key, v.description].some((f) => fold(f).includes(needle));
    });
    const sorted = [...filtered].sort((a, b) =>
      a[sort.key].localeCompare(b[sort.key], undefined, { sensitivity: "base" }),
    );
    return sort.desc ? sorted.reverse() : sorted;
  }, [all, search, valueFilter, usageFilter, usage, sort]);

  const pages = Math.max(1, Math.ceil(rows.length / pageSize));
  const current = Math.min(page, pages - 1);
  const visible = rows.slice(current * pageSize, current * pageSize + pageSize);
  const resetPage = () => setPage(0);

  const toggleSort = (key: SortKey) =>
    setSort((s) => (s.key === key ? { key, desc: !s.desc } : { key, desc: false }));

  const remove = async (v: AutofillVariable) => {
    const used = usage[v.key] ?? 0;
    const ok = await dlg.confirm({
      message: used
        ? t("autofill.vars.confirmDeleteUsed", { label: v.label, count: used })
        : t("autofill.vars.confirmDelete", { label: v.label }),
      danger: true,
    });
    if (ok) save.mutate(all.filter((x) => x.id !== v.id));
  };

  const SortHeader = ({ k, children }: { k: SortKey; children: React.ReactNode }) => (
    <th className="py-2 pr-3 font-medium">
      <button
        type="button"
        onClick={() => toggleSort(k)}
        className="inline-flex items-center gap-1 uppercase hover:text-slate-900 dark:hover:text-slate-100"
      >
        {children}
        {sort.key === k &&
          (sort.desc ? <ArrowDown className="h-3 w-3" /> : <ArrowUp className="h-3 w-3" />)}
      </button>
    </th>
  );

  if (variables.isLoading) {
    return <div className="text-sm text-slate-400">{t("common.loading")}</div>;
  }

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center gap-2">
        <div className="relative min-w-[12rem] flex-1">
          <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
          <input
            value={search}
            onChange={(e) => {
              setSearch(e.target.value);
              resetPage();
            }}
            placeholder={t("autofill.vars.search")}
            aria-label={t("autofill.vars.search")}
            className={`${inputCls} pl-9`}
          />
        </div>
        <button type="button" onClick={() => setEditing("new")} className={btnPrimary}>
          <Plus className="h-4 w-4" /> {t("autofill.vars.add")}
        </button>
      </div>
      <div className="flex flex-wrap items-center gap-2">
        <select
          value={valueFilter}
          onChange={(e) => {
            setValueFilter(e.target.value as ValueFilter);
            resetPage();
          }}
          aria-label={t("autofill.vars.filterValue")}
          className={selectCls}
        >
          <option value="all">{t("autofill.vars.valueAll")}</option>
          <option value="filled">{t("autofill.vars.valueFilled")}</option>
          <option value="empty">{t("autofill.vars.valueEmpty")}</option>
        </select>
        <select
          value={usageFilter}
          onChange={(e) => {
            setUsageFilter(e.target.value as UsageFilter);
            resetPage();
          }}
          aria-label={t("autofill.vars.filterUsage")}
          className={selectCls}
        >
          <option value="all">{t("autofill.vars.usageAll")}</option>
          <option value="used">{t("autofill.vars.usageUsed")}</option>
          <option value="unused">{t("autofill.vars.usageUnused")}</option>
        </select>
      </div>

      {save.isError && (
        <p className="text-sm text-red-600">
          {save.error instanceof Error ? save.error.message : String(save.error)}
        </p>
      )}

      {all.length === 0 ? (
        <p className="rounded-lg border border-dashed border-slate-300 p-6 text-center text-sm text-slate-500 dark:border-slate-700">
          {t("autofill.vars.empty")}
        </p>
      ) : (
        <div className="overflow-x-auto">
          <table data-testid="autofill-variables" className="w-full min-w-[30rem] text-sm">
            <thead>
              <tr className="border-b border-slate-200 text-left text-xs text-slate-500 dark:border-slate-800">
                <SortHeader k="label">{t("autofill.vars.label")}</SortHeader>
                <SortHeader k="key">{t("autofill.vars.key")}</SortHeader>
                <th className="py-2 pr-3 font-medium uppercase">{t("autofill.vars.value")}</th>
                <th className="py-2 pr-3 font-medium uppercase">{t("autofill.vars.usage")}</th>
                <th className="py-2 text-right font-medium uppercase">
                  {t("autofill.vars.actions")}
                </th>
              </tr>
            </thead>
            <tbody>
              {visible.map((v) => {
                const shown = revealed.has(v.id);
                const used = usage[v.key] ?? 0;
                return (
                  <tr
                    key={v.id}
                    data-testid="autofill-variable"
                    className="border-b border-slate-100 last:border-0 dark:border-slate-800/60"
                  >
                    <td className="py-2 pr-3">
                      <div className="font-medium">{v.label}</div>
                      {v.description && (
                        <div
                          className="max-w-[14rem] truncate text-xs text-slate-500"
                          title={v.description}
                        >
                          {v.description}
                        </div>
                      )}
                    </td>
                    <td className="py-2 pr-3">
                      <code className="text-xs text-slate-500">{`{{${v.key}}}`}</code>
                    </td>
                    <td className="py-2 pr-3">
                      {v.value === "" ? (
                        <span className="text-xs italic text-slate-400">
                          {t("autofill.vars.noValue")}
                        </span>
                      ) : (
                        <span className="inline-flex items-center gap-1">
                          <span className="max-w-[9rem] truncate font-mono text-xs">
                            {shown ? v.value : "••••••••"}
                          </span>
                          <button
                            type="button"
                            onClick={() =>
                              setRevealed((s) => {
                                const n = new Set(s);
                                if (n.has(v.id)) n.delete(v.id);
                                else n.add(v.id);
                                return n;
                              })
                            }
                            aria-label={
                              shown
                                ? t("autofill.vars.hideOf", { label: v.label })
                                : t("autofill.vars.showOf", { label: v.label })
                            }
                            className={iconBtn}
                          >
                            {shown ? <EyeOff className="h-3.5 w-3.5" /> : <Eye className="h-3.5 w-3.5" />}
                          </button>
                        </span>
                      )}
                    </td>
                    <td className="whitespace-nowrap py-2 pr-3 text-xs text-slate-500">
                      {used > 0 ? t("autofill.vars.usedIn", { count: used }) : t("autofill.vars.unused")}
                    </td>
                    <td className="whitespace-nowrap py-2 text-right">
                      <button
                        type="button"
                        onClick={() => setEditing(v)}
                        aria-label={t("autofill.vars.editOf", { label: v.label })}
                        title={t("common.edit")}
                        className={iconBtn}
                      >
                        <PencilLine className="h-4 w-4" />
                      </button>
                      <button
                        type="button"
                        onClick={() => void remove(v)}
                        aria-label={t("autofill.vars.deleteOf", { label: v.label })}
                        title={t("common.delete")}
                        className={`${iconBtn} hover:!text-red-600`}
                      >
                        <Trash2 className="h-4 w-4" />
                      </button>
                    </td>
                  </tr>
                );
              })}
              {visible.length === 0 && (
                <tr>
                  <td colSpan={5} className="py-6 text-center text-sm text-slate-400">
                    {t("autofill.vars.noMatches")}
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      )}

      {all.length > 0 && (
        <div className="flex flex-wrap items-center gap-2 text-sm">
          <span className="text-xs text-slate-500">
            {rows.length === 0
              ? t("autofill.vars.range", { from: 0, to: 0, total: 0 })
              : t("autofill.vars.range", {
                  from: current * pageSize + 1,
                  to: Math.min((current + 1) * pageSize, rows.length),
                  total: rows.length,
                })}
          </span>
          <div className="ml-auto flex items-center gap-2">
            <select
              value={pageSize}
              onChange={(e) => {
                setPageSize(Number(e.target.value));
                resetPage();
              }}
              aria-label={t("autofill.vars.pageSize")}
              className={selectCls}
            >
              {PAGE_SIZES.map((n) => (
                <option key={n} value={n}>
                  {t("autofill.vars.perPage", { count: n })}
                </option>
              ))}
            </select>
            <button
              type="button"
              disabled={current === 0}
              onClick={() => setPage(current - 1)}
              aria-label={t("autofill.vars.prevPage")}
              className={`${btnSecondary} px-2`}
            >
              <ChevronLeft className="h-4 w-4" />
            </button>
            <span className="text-xs text-slate-500">
              {t("autofill.vars.pageOf", { page: current + 1, pages })}
            </span>
            <button
              type="button"
              disabled={current >= pages - 1}
              onClick={() => setPage(current + 1)}
              aria-label={t("autofill.vars.nextPage")}
              className={`${btnSecondary} px-2`}
            >
              <ChevronRight className="h-4 w-4" />
            </button>
          </div>
        </div>
      )}

      {editing && (
        <VariableDialog
          initial={editing === "new" ? null : editing}
          existing={all}
          usage={usage}
          saving={save.isPending}
          onClose={() => setEditing(null)}
          onSave={(v) =>
            save.mutate(
              editing === "new" ? [...all, v] : all.map((x) => (x.id === v.id ? v : x)),
              { onSuccess: () => setEditing(null) },
            )
          }
        />
      )}
    </div>
  );
}

function VariableDialog({
  initial,
  existing,
  usage,
  saving,
  onClose,
  onSave,
}: {
  initial: AutofillVariable | null;
  existing: AutofillVariable[];
  usage: Record<string, number>;
  saving: boolean;
  onClose: () => void;
  onSave: (v: AutofillVariable) => void;
}) {
  const { t } = useTranslation();
  const [label, setLabel] = useState(initial?.label ?? "");
  const [key, setKey] = useState(initial?.key ?? "");
  const [keyTouched, setKeyTouched] = useState(!!initial);
  const [value, setValue] = useState(initial?.value ?? "");
  const [description, setDescription] = useState(initial?.description ?? "");
  const [shown, setShown] = useState(false);

  const usedKeys = new Set(existing.filter((v) => v.id !== initial?.id).map((v) => v.key));
  const error = !label.trim()
    ? t("autofill.vars.errorLabel")
    : !AUTOFILL_KEY_PATTERN.test(key)
      ? t("autofill.vars.errorKey")
      : usedKeys.has(key)
        ? t("autofill.vars.errorDuplicate", { key })
        : null;
  const renamedUsed =
    initial && initial.key !== key && (usage[initial.key] ?? 0) > 0
      ? t("autofill.vars.renameWarning", { key: initial.key, count: usage[initial.key] })
      : null;

  const applyPreset = (preset: (typeof PRESETS)[number]) => {
    setLabel(t(`autofill.presets.${preset}`));
    setKey(preset);
    setKeyTouched(true);
  };

  return (
    <Modal
      title={initial ? t("autofill.vars.editTitle") : t("autofill.vars.newTitle")}
      onClose={onClose}
    >
      <form
        data-testid="autofill-variable-dialog"
        className="space-y-3"
        onSubmit={(e) => {
          e.preventDefault();
          if (error) return;
          onSave({
            id: initial?.id ?? crypto.randomUUID(),
            label: label.trim(),
            key,
            value,
            description,
          });
        }}
      >
        {!initial && (
          <div className="flex flex-wrap gap-1.5">
            {PRESETS.filter((p) => !usedKeys.has(p)).map((p) => (
              <button
                key={p}
                type="button"
                onClick={() => applyPreset(p)}
                className="rounded-full border border-dashed border-slate-300 px-2.5 py-1 text-xs text-slate-600 hover:bg-slate-100 dark:border-slate-700 dark:text-slate-300 dark:hover:bg-slate-800"
              >
                + {t(`autofill.presets.${p}`)}
              </button>
            ))}
          </div>
        )}
        <label className="block space-y-1">
          <span className="text-xs font-medium text-slate-500">{t("autofill.vars.label")}</span>
          <input
            value={label}
            maxLength={80}
            autoFocus
            onChange={(e) => {
              setLabel(e.target.value);
              if (!keyTouched) setKey(slugifyKey(e.target.value));
            }}
            className={inputCls}
          />
        </label>
        <label className="block space-y-1">
          <span className="text-xs font-medium text-slate-500">{t("autofill.vars.key")}</span>
          <input
            value={key}
            maxLength={40}
            onChange={(e) => {
              setKey(e.target.value.toLowerCase());
              setKeyTouched(true);
            }}
            className={`${inputCls} font-mono`}
          />
          <span className="block text-xs text-slate-400">
            {t("autofill.vars.keyHint", { template: `{{${key || "…"}}}` })}
          </span>
        </label>
        <label className="block space-y-1">
          <span className="text-xs font-medium text-slate-500">{t("autofill.vars.value")}</span>
          <div className="flex items-stretch gap-2">
            <input
              value={value}
              maxLength={2000}
              type={shown ? "text" : "password"}
              autoComplete="off"
              onChange={(e) => setValue(e.target.value)}
              className={inputCls}
            />
            <button
              type="button"
              onClick={() => setShown((s) => !s)}
              aria-label={shown ? t("autofill.vars.hide") : t("autofill.vars.show")}
              className="shrink-0 rounded-lg border border-slate-300 px-2 text-slate-500 hover:bg-slate-100 dark:border-slate-700 dark:hover:bg-slate-800"
            >
              {shown ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
            </button>
          </div>
        </label>
        <label className="block space-y-1">
          <span className="text-xs font-medium text-slate-500">
            {t("autofill.vars.description")}
          </span>
          <textarea
            value={description}
            maxLength={300}
            rows={2}
            placeholder={t("autofill.vars.descriptionPlaceholder")}
            onChange={(e) => setDescription(e.target.value)}
            className={inputCls}
          />
        </label>
        {renamedUsed && <p className="text-xs text-amber-700 dark:text-amber-300">{renamedUsed}</p>}
        {error && (label || key) && <p className="text-xs text-red-600">{error}</p>}
        <div className="flex justify-end gap-2 pt-1">
          <button type="button" onClick={onClose} className={btnSecondary}>
            {t("common.cancel")}
          </button>
          <button type="submit" disabled={!!error || saving} className={btnPrimary}>
            {t("common.save")}
          </button>
        </div>
      </form>
    </Modal>
  );
}
