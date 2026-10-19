import type {
  AutofillVariable,
  Automation,
  AutomationContent,
  AutomationAction,
  AutomationInput,
  AutomationStep,
  AutomationTrigger,
} from "@awesome-bookmarks/shared";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  ArrowDown,
  ArrowUp,
  Check,
  Code2,
  PencilLine,
  Plus,
  ShieldAlert,
  Trash2,
  WandSparkles,
} from "lucide-react";
import { useState } from "react";
import { useTranslation } from "react-i18next";
import { Link } from "react-router-dom";
import { ApiError, api } from "../api.js";
import { notifyAutomationsChanged, useExtensionAvailable } from "../lib/extensionBridge.js";
import { dlg } from "./dialogs.js";
import { EntitySection, SectionAction } from "./EntitySection.js";

const controlCls =
  "rounded border border-slate-300 bg-white px-2 py-1 text-sm outline-none focus:border-slate-400 dark:border-slate-700 dark:bg-slate-800";
const inputCls = `w-full ${controlCls}`;
const btnPrimary =
  "inline-flex items-center gap-1.5 rounded bg-slate-900 px-3 py-1.5 text-sm font-medium text-white hover:bg-slate-800 disabled:opacity-50 dark:bg-slate-100 dark:text-slate-900 dark:hover:bg-white";
const btnSecondary =
  "inline-flex items-center gap-1.5 rounded border border-slate-300 px-3 py-1.5 text-sm hover:bg-slate-100 disabled:opacity-50 dark:border-slate-700 dark:hover:bg-slate-800";

const ACTIONS: AutomationAction[] = ["fill", "select", "check", "click", "wait", "pause"];

function blankStep(action: AutomationAction): AutomationStep {
  switch (action) {
    case "fill":
    case "select":
      return { action, selector: "", value: "" };
    case "check":
      return { action, selector: "", checked: true };
    case "click":
    case "wait":
      return { action, selector: "" };
    case "pause":
      return { action, ms: 500 };
  }
}

function retarget(step: AutomationStep, action: AutomationAction): AutomationStep {
  const next = blankStep(action);
  if ("selector" in step && "selector" in next) next.selector = step.selector;
  if ("value" in step && "value" in next) next.value = step.value;
  return next;
}

function draftFrom(a: Automation | null): AutomationInput {
  if (!a) {
    return {
      enabled: true,
      trigger: "open",
      timeoutMs: 10000,
      steps: [blankStep("fill")],
      script: "",
    };
  }
  return {
    enabled: a.enabled,
    trigger: a.trigger,
    timeoutMs: a.timeoutMs,
    steps: a.steps,
    script: a.script,
  };
}

export function AutomationSection({ bookmarkId, url }: { bookmarkId: string; url: string }) {
  const { t } = useTranslation();
  const qc = useQueryClient();
  const extension = useExtensionAvailable();
  const automatable = /^https?:\/\//i.test(url);
  const q = useQuery({
    queryKey: ["automation", bookmarkId],
    queryFn: () => api.getAutomation(bookmarkId),
    enabled: automatable,
  });
  const vars = useQuery({
    queryKey: ["autofill-variables"],
    queryFn: api.listAutofillVariables,
    enabled: automatable,
  });
  const [draft, setDraft] = useState<AutomationInput | null>(null);
  const [error, setError] = useState<string | null>(null);

  const refresh = (a: Automation | null) => {
    qc.setQueryData(["automation", bookmarkId], { automation: a });
    qc.invalidateQueries({ queryKey: ["automation-summaries"] });
    notifyAutomationsChanged();
  };
  const fail = (e: unknown) =>
    setError(e instanceof ApiError || e instanceof Error ? e.message : String(e));

  const save = useMutation({
    mutationFn: (body: AutomationInput) => api.saveAutomation(bookmarkId, body),
    onSuccess: (a) => {
      refresh(a);
      setDraft(null);
      setError(null);
    },
    onError: fail,
  });
  const approve = useMutation({
    mutationFn: (fingerprint: string) => api.approveAutomation(bookmarkId, fingerprint),
    onSuccess: (a) => {
      refresh(a);
      setError(null);
    },
    onError: (e) => {
      fail(e);
      qc.invalidateQueries({ queryKey: ["automation", bookmarkId] });
    },
  });
  const remove = useMutation({
    mutationFn: () => api.deleteAutomation(bookmarkId),
    onSuccess: () => {
      refresh(null);
      setDraft(null);
    },
    onError: fail,
  });

  if (!automatable) return null;
  const automation = q.data?.automation ?? null;

  return (
    <EntitySection
      icon={<WandSparkles className="h-3.5 w-3.5" />}
      title={t("autofill.section.title")}
      action={
        !draft && (
          <SectionAction
            onClick={() => setDraft(draftFrom(automation))}
            icon={
              automation ? <PencilLine className="h-3 w-3" /> : <Plus className="h-3 w-3" />
            }
          >
            {automation ? t("common.edit") : t("autofill.section.add")}
          </SectionAction>
        )
      }
    >
      <div data-testid="automation-section" className="space-y-3">
        {error && <p className="text-sm text-red-600">{error}</p>}
        {draft ? (
          <AutomationEditor
            draft={draft}
            variables={vars.data ?? []}
            onChange={setDraft}
            onCancel={() => {
              setDraft(null);
              setError(null);
            }}
            onSave={() => save.mutate(draft)}
            saving={save.isPending}
          />
        ) : automation ? (
          <>
            {automation.status === "pending" && (
              <div
                data-testid="automation-pending"
                className="flex flex-wrap items-start gap-3 rounded-lg border border-amber-300 bg-amber-50 p-3 text-sm dark:border-amber-900/70 dark:bg-amber-950/30"
              >
                <ShieldAlert className="mt-0.5 h-4 w-4 shrink-0 text-amber-600" />
                <div className="min-w-0 flex-1 space-y-1">
                  <p className="font-medium">{t("autofill.section.pendingTitle")}</p>
                  <p className="text-xs text-slate-600 dark:text-slate-300">
                    {t("autofill.section.pendingHint")}
                  </p>
                </div>
                <button
                  type="button"
                  onClick={() => approve.mutate(automation.fingerprint)}
                  disabled={approve.isPending}
                  className={btnPrimary}
                >
                  <Check className="h-4 w-4" /> {t("autofill.section.approve")}
                </button>
              </div>
            )}
            {automation.status === "pending" && automation.previousApproved ? (
              <AutomationDiff before={automation.previousApproved} after={automation} />
            ) : (
              <AutomationSummaryView automation={automation} />
            )}
            {automation.unknownVariables.length > 0 && (
              <p className="text-xs text-amber-700 dark:text-amber-300">
                {t("autofill.section.unknownVariables", {
                  keys: automation.unknownVariables.join(", "),
                })}{" "}
                <Link to="/settings/autofill" className="underline">
                  {t("autofill.section.defineVariables")}
                </Link>
              </p>
            )}
            {!extension && (
              <p className="text-xs text-slate-500">{t("autofill.section.needsRunner")}</p>
            )}
            <div>
              <button
                type="button"
                onClick={async () => {
                  if (
                    await dlg.confirm({
                      message: t("autofill.section.confirmDelete"),
                      danger: true,
                    })
                  ) {
                    remove.mutate();
                  }
                }}
                className="inline-flex items-center gap-1 text-xs text-red-600 hover:underline"
              >
                <Trash2 className="h-3 w-3" /> {t("autofill.section.delete")}
              </button>
            </div>
          </>
        ) : (
          <p className="text-sm text-slate-500">{t("autofill.section.empty")}</p>
        )}
      </div>
    </EntitySection>
  );
}

export function StepText({ step }: { step: AutomationStep }) {
  const { t } = useTranslation();
  const sel = "selector" in step ? <code className="text-xs">{step.selector}</code> : null;
  switch (step.action) {
    case "fill":
    case "select":
      return (
        <>
          {t(`autofill.actions.${step.action}`)} {sel} ← <code className="text-xs">{step.value}</code>
        </>
      );
    case "check":
      return (
        <>
          {t(step.checked ? "autofill.actions.check" : "autofill.actions.uncheck")} {sel}
        </>
      );
    case "click":
    case "wait":
      return (
        <>
          {t(`autofill.actions.${step.action}`)} {sel}
        </>
      );
    case "pause":
      return <>{t("autofill.actions.pauseMs", { ms: step.ms })}</>;
  }
}

type DiffLine = { kind: "same" | "added" | "removed"; step: AutomationStep };

function diffSteps(before: AutomationStep[], after: AutomationStep[]): DiffLine[] {
  const a = before.map((x) => JSON.stringify(x));
  const b = after.map((x) => JSON.stringify(x));
  const lcs = Array.from({ length: a.length + 1 }, () => new Array<number>(b.length + 1).fill(0));
  for (let i = a.length - 1; i >= 0; i--) {
    for (let j = b.length - 1; j >= 0; j--) {
      lcs[i]![j] = a[i] === b[j] ? lcs[i + 1]![j + 1]! + 1 : Math.max(lcs[i + 1]![j]!, lcs[i]![j + 1]!);
    }
  }
  const out: DiffLine[] = [];
  let i = 0;
  let j = 0;
  while (i < a.length || j < b.length) {
    if (i < a.length && j < b.length && a[i] === b[j]) {
      out.push({ kind: "same", step: after[j]! });
      i++;
      j++;
    } else if (j < b.length && (i === a.length || lcs[i]![j + 1]! >= lcs[i + 1]![j]!)) {
      out.push({ kind: "added", step: after[j]! });
      j++;
    } else {
      out.push({ kind: "removed", step: before[i]! });
      i++;
    }
  }
  return out;
}

function AutomationDiff({ before, after }: { before: AutomationContent; after: Automation }) {
  const { t } = useTranslation();
  const lines = diffSteps(before.steps, after.steps);
  const changes: string[] = [];
  if (before.enabled !== after.enabled) {
    changes.push(after.enabled ? t("autofill.diff.enabled") : t("autofill.diff.disabled"));
  }
  if (before.trigger !== after.trigger) {
    changes.push(t("autofill.diff.trigger", { trigger: t(`autofill.triggers.${after.trigger}`) }));
  }
  if (before.timeoutMs !== after.timeoutMs) {
    changes.push(
      t("autofill.diff.timeout", {
        before: Math.round(before.timeoutMs / 1000),
        after: Math.round(after.timeoutMs / 1000),
      }),
    );
  }
  const scriptChanged = before.script !== after.script;
  return (
    <div data-testid="automation-diff" className="space-y-2 text-sm">
      <p className="text-xs font-medium text-slate-500">{t("autofill.diff.title")}</p>
      {changes.map((c) => (
        <p key={c} className="text-xs text-amber-700 dark:text-amber-300">
          {c}
        </p>
      ))}
      <ol className="space-y-0.5">
        {lines.map((line, k) => (
          <li
            key={k}
            data-diff={line.kind}
            className={
              line.kind === "added"
                ? "rounded bg-emerald-50 px-1 text-emerald-800 dark:bg-emerald-950/40 dark:text-emerald-200"
                : line.kind === "removed"
                  ? "rounded bg-red-50 px-1 text-red-700 line-through dark:bg-red-950/40 dark:text-red-300"
                  : "px-1 text-slate-600 dark:text-slate-300"
            }
          >
            <span className="mr-1 inline-block w-3 font-mono">
              {line.kind === "added" ? "+" : line.kind === "removed" ? "−" : ""}
            </span>
            <StepText step={line.step} />
          </li>
        ))}
      </ol>
      {scriptChanged && (
        <details open>
          <summary className="cursor-pointer text-xs text-amber-700 dark:text-amber-300">
            {t("autofill.diff.script")}
          </summary>
          <div className="mt-1 grid gap-2 sm:grid-cols-2">
            <pre className="max-h-48 overflow-auto rounded bg-red-50 p-2 text-xs dark:bg-red-950/40">
              {before.script || "∅"}
            </pre>
            <pre className="max-h-48 overflow-auto rounded bg-emerald-50 p-2 text-xs dark:bg-emerald-950/40">
              {after.script || "∅"}
            </pre>
          </div>
        </details>
      )}
    </div>
  );
}

export function AutomationStepsList({ automation }: { automation: AutomationContent }) {
  const { t } = useTranslation();
  return (
    <div className="space-y-1 text-xs">
      <div className="text-slate-500">
        {automation.enabled ? t("autofill.section.enabled") : t("autofill.section.disabled")}
        {" · "}
        {t(`autofill.triggers.${automation.trigger}`)}
      </div>
      <ol className="list-decimal space-y-0.5 pl-5">
        {automation.steps.map((s, i) => (
          <li key={i}>
            <StepText step={s} />
          </li>
        ))}
      </ol>
      {automation.script.trim() && (
        <pre className="max-h-32 overflow-auto rounded bg-slate-50 p-2 dark:bg-slate-950/40">
          {automation.script}
        </pre>
      )}
    </div>
  );
}

function AutomationSummaryView({ automation }: { automation: Automation }) {
  const { t } = useTranslation();
  return (
    <div className="space-y-2 text-sm">
      <div className="flex flex-wrap gap-2 text-xs text-slate-500">
        <span
          className={`rounded px-1.5 py-0.5 ${
            automation.enabled
              ? "bg-emerald-100 text-emerald-800 dark:bg-emerald-900/40 dark:text-emerald-200"
              : "bg-slate-100 text-slate-600 dark:bg-slate-800 dark:text-slate-300"
          }`}
        >
          {automation.enabled ? t("autofill.section.enabled") : t("autofill.section.disabled")}
        </span>
        <span>{t(`autofill.triggers.${automation.trigger}`)}</span>
      </div>
      {automation.steps.length > 0 && (
        <ol className="list-decimal space-y-0.5 pl-5">
          {automation.steps.map((s, i) => (
            <li key={i}>
              <StepText step={s} />
            </li>
          ))}
        </ol>
      )}
      {automation.script.trim() && (
        <details>
          <summary className="cursor-pointer text-xs text-slate-500">
            <Code2 className="mr-1 inline h-3 w-3" />
            {t("autofill.section.scriptSummary")}
          </summary>
          <pre className="mt-1 max-h-64 overflow-auto rounded bg-slate-50 p-2 text-xs dark:bg-slate-950/40">
            {automation.script}
          </pre>
        </details>
      )}
    </div>
  );
}

function AutomationEditor({
  draft,
  variables,
  onChange,
  onCancel,
  onSave,
  saving,
}: {
  draft: AutomationInput;
  variables: AutofillVariable[];
  onChange: (d: AutomationInput) => void;
  onCancel: () => void;
  onSave: () => void;
  saving: boolean;
}) {
  const { t } = useTranslation();
  const [showScript, setShowScript] = useState(draft.script.trim() !== "");
  const setStep = (i: number, step: AutomationStep) =>
    onChange({ ...draft, steps: draft.steps.map((s, j) => (j === i ? step : s)) });
  const move = (i: number, by: number) => {
    const steps = [...draft.steps];
    const [s] = steps.splice(i, 1);
    steps.splice(i + by, 0, s!);
    onChange({ ...draft, steps });
  };
  const empty =
    (draft.steps.length === 0 && draft.script.trim() === "") ||
    draft.steps.some((s) => "selector" in s && !s.selector.trim());

  return (
    <div data-testid="automation-editor" className="space-y-3">
      <div className="flex flex-wrap items-center gap-4 text-sm">
        <label className="flex items-center gap-2">
          <input
            type="checkbox"
            checked={draft.enabled}
            onChange={(e) => onChange({ ...draft, enabled: e.target.checked })}
          />
          {t("autofill.section.enabled")}
        </label>
        <label className="flex items-center gap-2">
          {t("autofill.section.trigger")}
          <select
            value={draft.trigger}
            onChange={(e) =>
              onChange({ ...draft, trigger: e.target.value as AutomationTrigger })
            }
            className={controlCls}
          >
            <option value="open">{t("autofill.triggers.open")}</option>
            <option value="always">{t("autofill.triggers.always")}</option>
          </select>
        </label>
        <label className="flex items-center gap-2">
          {t("autofill.section.timeout")}
          <input
            type="number"
            min={1}
            max={60}
            value={Math.round(draft.timeoutMs / 1000)}
            onChange={(e) =>
              onChange({
                ...draft,
                timeoutMs: Math.min(60, Math.max(1, Number(e.target.value) || 10)) * 1000,
              })
            }
            className={`${controlCls} w-16`}
          />
          s
        </label>
      </div>

      <div className="space-y-2">
        {draft.steps.map((step, i) => (
          <div
            key={i}
            data-testid="automation-step"
            className="flex flex-wrap items-center gap-2 rounded border border-slate-200 p-2 dark:border-slate-800"
          >
            <span className="w-5 text-right text-xs text-slate-400">{i + 1}.</span>
            <select
              aria-label={t("autofill.section.action")}
              value={step.action}
              onChange={(e) => setStep(i, retarget(step, e.target.value as AutomationAction))}
              className={controlCls}
            >
              {ACTIONS.map((a) => (
                <option key={a} value={a}>
                  {t(`autofill.actions.${a}`)}
                </option>
              ))}
            </select>
            {"selector" in step && (
              <input
                aria-label={t("autofill.section.selector")}
                placeholder={t("autofill.section.selectorPlaceholder")}
                value={step.selector}
                onChange={(e) => setStep(i, { ...step, selector: e.target.value })}
                className={`${inputCls} min-w-[10rem] flex-1 font-mono`}
              />
            )}
            {"value" in step && (
              <div className="flex min-w-[10rem] flex-1 items-center gap-1">
                <input
                  aria-label={t("autofill.section.value")}
                  placeholder={t("autofill.section.valuePlaceholder")}
                  value={step.value}
                  onChange={(e) => setStep(i, { ...step, value: e.target.value })}
                  className={`${inputCls} font-mono`}
                />
                {variables.length > 0 && (
                  <select
                    aria-label={t("autofill.section.insertVariable")}
                    value=""
                    onChange={(e) => {
                      if (e.target.value) {
                        setStep(i, { ...step, value: `${step.value}{{${e.target.value}}}` });
                      }
                    }}
                    className={controlCls}
                  >
                    <option value="">{"{{…}}"}</option>
                    {variables.map((v) => (
                      <option key={v.id} value={v.key}>
                        {v.label}
                      </option>
                    ))}
                  </select>
                )}
              </div>
            )}
            {step.action === "check" && (
              <label className="flex items-center gap-1 text-sm">
                <input
                  type="checkbox"
                  checked={step.checked}
                  onChange={(e) => setStep(i, { ...step, checked: e.target.checked })}
                />
                {t("autofill.section.checked")}
              </label>
            )}
            {step.action === "pause" && (
              <label className="flex items-center gap-1 text-sm">
                <input
                  type="number"
                  min={0}
                  max={30000}
                  step={100}
                  value={step.ms}
                  onChange={(e) =>
                    setStep(i, {
                      ...step,
                      ms: Math.min(30000, Math.max(0, Number(e.target.value) || 0)),
                    })
                  }
                  className={`${controlCls} w-24`}
                />
                ms
              </label>
            )}
            <div className="ml-auto flex items-center">
              <button
                type="button"
                disabled={i === 0}
                onClick={() => move(i, -1)}
                aria-label={t("autofill.section.moveUp")}
                className="rounded p-1 text-slate-400 hover:text-slate-900 disabled:opacity-30 dark:hover:text-slate-100"
              >
                <ArrowUp className="h-4 w-4" />
              </button>
              <button
                type="button"
                disabled={i === draft.steps.length - 1}
                onClick={() => move(i, 1)}
                aria-label={t("autofill.section.moveDown")}
                className="rounded p-1 text-slate-400 hover:text-slate-900 disabled:opacity-30 dark:hover:text-slate-100"
              >
                <ArrowDown className="h-4 w-4" />
              </button>
              <button
                type="button"
                onClick={() =>
                  onChange({ ...draft, steps: draft.steps.filter((_, j) => j !== i) })
                }
                aria-label={t("autofill.section.removeStep")}
                className="rounded p-1 text-slate-400 hover:text-red-600"
              >
                <Trash2 className="h-4 w-4" />
              </button>
            </div>
          </div>
        ))}
        <button
          type="button"
          onClick={() => onChange({ ...draft, steps: [...draft.steps, blankStep("fill")] })}
          className={btnSecondary}
        >
          <Plus className="h-4 w-4" /> {t("autofill.section.addStep")}
        </button>
      </div>

      <div className="space-y-1">
        <button
          type="button"
          onClick={() => setShowScript((v) => !v)}
          className="inline-flex items-center gap-1 text-xs text-slate-500 hover:text-slate-900 dark:hover:text-slate-100"
        >
          <Code2 className="h-3 w-3" /> {t("autofill.section.scriptToggle")}
        </button>
        {showScript && (
          <>
            <textarea
              aria-label={t("autofill.section.scriptSummary")}
              value={draft.script}
              onChange={(e) => onChange({ ...draft, script: e.target.value })}
              rows={8}
              spellCheck={false}
              placeholder={"document.querySelector('#nif').value = ab.vars.dni;"}
              className={`${inputCls} font-mono text-xs`}
            />
            <p className="text-xs text-slate-500">{t("autofill.section.scriptHint")}</p>
          </>
        )}
      </div>

      <div className="flex items-center gap-2">
        <button
          type="button"
          onClick={onSave}
          disabled={saving || empty}
          className={btnPrimary}
        >
          {t("common.save")}
        </button>
        <button type="button" onClick={onCancel} className={btnSecondary}>
          {t("common.cancel")}
        </button>
      </div>
    </div>
  );
}
