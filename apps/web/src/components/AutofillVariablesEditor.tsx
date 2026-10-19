import {
  AUTOFILL_KEY_PATTERN,
  type AutofillVariable,
} from "@awesome-bookmarks/shared";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Eye, EyeOff, Plus, Save, Trash2 } from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import { api } from "../api.js";
import { notifyAutomationsChanged } from "../lib/extensionBridge.js";

const inputCls =
  "w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm outline-none transition focus:border-slate-400 focus:ring-2 focus:ring-slate-200 dark:border-slate-700 dark:bg-slate-800 dark:focus:ring-slate-700/50";
const btnPrimary =
  "inline-flex items-center gap-1.5 rounded-lg bg-slate-900 px-3.5 py-2 text-sm font-medium text-white transition hover:bg-slate-800 disabled:opacity-50 dark:bg-slate-100 dark:text-slate-900 dark:hover:bg-white";
const btnSecondary =
  "inline-flex items-center gap-1.5 rounded-lg border border-slate-300 px-3 py-1.5 text-sm transition hover:bg-slate-100 disabled:opacity-50 dark:border-slate-700 dark:hover:bg-slate-800";

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

interface Row extends AutofillVariable {
  keyTouched: boolean;
}

export function AutofillVariablesEditor() {
  const { t } = useTranslation();
  const qc = useQueryClient();
  const query = useQuery({
    queryKey: ["autofill-variables"],
    queryFn: api.listAutofillVariables,
  });
  const [rows, setRows] = useState<Row[] | null>(null);
  const [revealed, setRevealed] = useState<Set<string>>(new Set());
  const [savedAt, setSavedAt] = useState<number | null>(null);

  useEffect(() => {
    if (query.data && rows === null) {
      setRows(query.data.map((v) => ({ ...v, keyTouched: true })));
    }
  }, [query.data, rows]);

  const save = useMutation({
    mutationFn: (list: Row[]) =>
      api.saveAutofillVariables(
        list.map(({ keyTouched: _k, ...v }) => ({ ...v, label: v.label.trim() })),
      ),
    onSuccess: (saved) => {
      qc.setQueryData(["autofill-variables"], saved);
      qc.invalidateQueries({ queryKey: ["automation"] });
      notifyAutomationsChanged();
      setRows(saved.map((v) => ({ ...v, keyTouched: true })));
      setSavedAt(Date.now());
    },
  });

  const problems = useMemo(() => {
    const out = new Map<string, string>();
    const seen = new Map<string, string>();
    for (const r of rows ?? []) {
      if (!r.label.trim()) out.set(r.id, t("autofill.vars.errorLabel"));
      else if (!AUTOFILL_KEY_PATTERN.test(r.key)) out.set(r.id, t("autofill.vars.errorKey"));
      else if (seen.has(r.key)) out.set(r.id, t("autofill.vars.errorDuplicate", { key: r.key }));
      seen.set(r.key, r.id);
    }
    return out;
  }, [rows, t]);

  if (!rows) return <div className="text-sm text-slate-400">{t("common.loading")}</div>;

  const dirty =
    JSON.stringify(rows.map(({ keyTouched: _k, ...v }) => v)) !==
    JSON.stringify(query.data ?? []);

  const update = (id: string, patch: Partial<Row>) =>
    setRows((list) =>
      (list ?? []).map((r) => {
        if (r.id !== id) return r;
        const next = { ...r, ...patch };
        if (patch.label !== undefined && !r.keyTouched) next.key = slugifyKey(patch.label);
        return next;
      }),
    );

  const add = (preset?: (typeof PRESETS)[number]) =>
    setRows((list) => [
      ...(list ?? []),
      {
        id: crypto.randomUUID(),
        key: preset ?? "",
        label: preset ? t(`autofill.presets.${preset}`) : "",
        description: "",
        value: "",
        keyTouched: !!preset,
      },
    ]);

  const usedKeys = new Set(rows.map((r) => r.key));

  return (
    <div className="space-y-4">
      {rows.length === 0 && (
        <p className="text-sm text-slate-500">{t("autofill.vars.empty")}</p>
      )}
      <div className="space-y-3">
        {rows.map((r) => {
          const shown = revealed.has(r.id);
          const problem = problems.get(r.id);
          return (
            <div
              key={r.id}
              data-testid="autofill-variable"
              className="space-y-2 rounded-lg border border-slate-200 p-3 dark:border-slate-800"
            >
              <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
                <label className="space-y-1">
                  <span className="text-xs font-medium text-slate-500">
                    {t("autofill.vars.label")}
                  </span>
                  <input
                    value={r.label}
                    maxLength={80}
                    onChange={(e) => update(r.id, { label: e.target.value })}
                    className={inputCls}
                  />
                </label>
                <label className="space-y-1">
                  <span className="text-xs font-medium text-slate-500">
                    {t("autofill.vars.key")}
                  </span>
                  <input
                    value={r.key}
                    maxLength={40}
                    onChange={(e) =>
                      update(r.id, { key: e.target.value.toLowerCase(), keyTouched: true })
                    }
                    className={`${inputCls} font-mono`}
                  />
                </label>
              </div>
              <label className="block space-y-1">
                <span className="text-xs font-medium text-slate-500">
                  {t("autofill.vars.value")}
                </span>
                <div className="flex items-stretch gap-2">
                  <input
                    value={r.value}
                    maxLength={2000}
                    type={shown ? "text" : "password"}
                    autoComplete="off"
                    onChange={(e) => update(r.id, { value: e.target.value })}
                    className={inputCls}
                  />
                  <button
                    type="button"
                    onClick={() =>
                      setRevealed((s) => {
                        const n = new Set(s);
                        if (n.has(r.id)) n.delete(r.id);
                        else n.add(r.id);
                        return n;
                      })
                    }
                    title={shown ? t("autofill.vars.hide") : t("autofill.vars.show")}
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
                <input
                  value={r.description}
                  maxLength={300}
                  placeholder={t("autofill.vars.descriptionPlaceholder")}
                  onChange={(e) => update(r.id, { description: e.target.value })}
                  className={inputCls}
                />
              </label>
              <div className="flex items-center gap-2">
                <code className="text-xs text-slate-400">{`{{${r.key || "…"}}}`}</code>
                {problem && <span className="text-xs text-red-600">{problem}</span>}
                <button
                  type="button"
                  onClick={() => setRows((list) => (list ?? []).filter((x) => x.id !== r.id))}
                  className="ml-auto inline-flex items-center gap-1 rounded px-2 py-1 text-xs text-red-600 hover:bg-red-50 dark:hover:bg-red-950"
                >
                  <Trash2 className="h-3 w-3" /> {t("common.delete")}
                </button>
              </div>
            </div>
          );
        })}
      </div>

      <div className="flex flex-wrap items-center gap-2">
        <button type="button" onClick={() => add()} className={btnSecondary}>
          <Plus className="h-4 w-4" /> {t("autofill.vars.add")}
        </button>
        {PRESETS.filter((p) => !usedKeys.has(p)).map((p) => (
          <button
            key={p}
            type="button"
            onClick={() => add(p)}
            className="rounded-full border border-dashed border-slate-300 px-2.5 py-1 text-xs text-slate-600 hover:bg-slate-100 dark:border-slate-700 dark:text-slate-300 dark:hover:bg-slate-800"
          >
            + {t(`autofill.presets.${p}`)}
          </button>
        ))}
      </div>

      <div className="flex items-center gap-3 border-t border-slate-200 pt-4 dark:border-slate-800">
        <button
          type="button"
          onClick={() => save.mutate(rows)}
          disabled={!dirty || problems.size > 0 || save.isPending}
          className={btnPrimary}
        >
          <Save className="h-4 w-4" /> {t("common.save")}
        </button>
        {save.isError && (
          <span className="text-sm text-red-600">
            {save.error instanceof Error ? save.error.message : String(save.error)}
          </span>
        )}
        {!dirty && savedAt && (
          <span className="text-sm text-emerald-600">{t("autofill.vars.saved")}</span>
        )}
      </div>
    </div>
  );
}
