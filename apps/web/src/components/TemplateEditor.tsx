import {
  PANEL_LAYOUT_DEFAULTS,
  PANEL_SCENES,
  type PanelLayout,
  type TemplateConfig,
  type TemplateItem,
} from "@awesome-bookmarks/shared";
import { useMutation } from "@tanstack/react-query";
import { useState } from "react";
import { useTranslation } from "react-i18next";
import { ApiError, api } from "../api.js";
import { ColorField } from "./ColorField.js";
import { Modal } from "./Modal.js";
import { TemplatePreview } from "./TemplatePreview.js";

const BASE: TemplateConfig = {
  layout: "grid",
  columns: 4,
  theme: {
    bg: "#0f172a",
    surface: "#1e293b",
    text: "#e2e8f0",
    muted: "#94a3b8",
    accent: "#38bdf8",
    border: "#334155",
  },
  card: {
    radius: "0.75rem",
    shadow: true,
    showIcon: true,
    showDescription: false,
    showUrl: false,
    showTags: true,
  },
  header: "banner",
  tagFilter: true,
};

const input =
  "w-full rounded border border-slate-300 bg-white px-2 py-1 text-sm dark:border-slate-700 dark:bg-slate-800";

export function TemplateEditor({
  initial,
  onClose,
  onSaved,
}: {
  initial?: TemplateItem;
  onClose: () => void;
  onSaved: () => void;
}) {
  const { t } = useTranslation();
  const editingExisting = !!initial && !initial.builtin;
  const [name, setName] = useState(
    initial ? (editingExisting ? initial.name : `${initial.name} (copia)`) : "Nueva plantilla",
  );
  const [config, setConfig] = useState<TemplateConfig>(initial?.config ?? BASE);
  const [err, setErr] = useState<string | null>(null);

  const save = useMutation({
    mutationFn: () =>
      editingExisting
        ? api.updateTemplate(initial!.id, { name, config })
        : api.createTemplate({ name, config }),
    onSuccess: onSaved,
    onError: (e) => setErr(e instanceof ApiError ? e.message : t("common.error")),
  });

  const setTheme = (k: keyof TemplateConfig["theme"], v: string) =>
    setConfig((c) => ({ ...c, theme: { ...c.theme, [k]: v } }));
  const setCard = (k: keyof TemplateConfig["card"], v: boolean | string) =>
    setConfig((c) => ({ ...c, card: { ...c.card, [k]: v } }));

  return (
    <Modal title={t("panels.templateEditorTitle")} onClose={onClose} size="xl">
      <div className="grid gap-4 lg:grid-cols-[300px_1fr]">
        <div className="space-y-3">
          <label className="block space-y-1 text-sm">
            <span className="text-slate-500">{t("panels.templateName")}</span>
            <input className={input} value={name} onChange={(e) => setName(e.target.value)} />
          </label>

          <div className="grid grid-cols-2 gap-2 text-sm">
            <label className="space-y-1">
              <span className="text-slate-500">{t("panels.layout")}</span>
              <select
                className={input}
                value={config.layout}
                onChange={(e) =>
                  setConfig((c) => ({ ...c, layout: e.target.value as PanelLayout }))
                }
              >
                {["grid", "list", "bento", "terminal", "dashboard"].map((l) => (
                  <option key={l} value={l}>
                    {l}
                  </option>
                ))}
              </select>
            </label>
            <label className="space-y-1">
              <span className="text-slate-500">{t("panels.columns")}</span>
              <input
                type="number"
                min={1}
                max={8}
                className={input}
                value={config.columns ?? 4}
                onChange={(e) =>
                  setConfig((c) => ({ ...c, columns: Number(e.target.value) || 1 }))
                }
              />
            </label>
          </div>

          <div className="grid grid-cols-2 gap-2 text-sm">
            {(
              ["bg", "surface", "text", "muted", "accent", "border"] as const
            ).map((k) => (
              <ColorField
                key={k}
                label={k}
                value={config.theme[k]}
                onChange={(v) => setTheme(k, v)}
              />
            ))}
          </div>

          <div className="flex flex-wrap gap-3 text-sm">
            {(
              [
                ["shadow", "shadow"],
                ["showIcon", "iconos"],
                ["showDescription", "descr."],
                ["showUrl", "url"],
                ["showTags", "tags"],
              ] as const
            ).map(([k, label]) => (
              <label key={k} className="flex items-center gap-1">
                <input
                  type="checkbox"
                  checked={config.card[k] as boolean}
                  onChange={(e) => setCard(k, e.target.checked)}
                />
                {label}
              </label>
            ))}
            <label className="flex items-center gap-1">
              <input
                type="checkbox"
                checked={config.tagFilter !== false}
                onChange={(e) =>
                  setConfig((c) => ({ ...c, tagFilter: e.target.checked }))
                }
              />
              {t("panels.tagFilter")}
            </label>
          </div>

          <div className="grid grid-cols-2 gap-2 text-sm">
            <label className="space-y-1">
              <span className="text-slate-500">radius</span>
              <input
                className={input}
                value={config.card.radius}
                onChange={(e) => setCard("radius", e.target.value)}
              />
            </label>
            <label className="space-y-1">
              <span className="text-slate-500">header</span>
              <select
                className={input}
                value={config.header ?? "banner"}
                onChange={(e) =>
                  setConfig((c) => ({
                    ...c,
                    header: e.target.value as TemplateConfig["header"],
                  }))
                }
              >
                {["banner", "minimal", "hidden"].map((h) => (
                  <option key={h} value={h}>
                    {h}
                  </option>
                ))}
              </select>
            </label>
          </div>

          <div className="grid grid-cols-2 gap-2 text-sm">
            <label className="space-y-1">
              <span className="text-slate-500">{t("panels.sceneLabel")}</span>
              <select
                className={input}
                value={config.scene ?? "none"}
                onChange={(e) =>
                  setConfig((c) => ({
                    ...c,
                    scene: e.target.value === "none" ? undefined : e.target.value,
                  }))
                }
              >
                {PANEL_SCENES.map((s) => (
                  <option key={s} value={s}>
                    {t(`panels.scene_${s}`)}
                  </option>
                ))}
              </select>
            </label>
            <label className="flex items-end gap-2 pb-1.5">
              <input
                type="checkbox"
                checked={!!config.folderPreview}
                onChange={(e) =>
                  setConfig((c) => ({ ...c, folderPreview: e.target.checked }))
                }
              />
              <span className="text-slate-500">{t("panels.folderPreview")}</span>
            </label>
          </div>

          {/* ---- Layout fine-tuning ---- */}
          <div className="space-y-2 rounded-lg border border-slate-200 p-2 dark:border-slate-800">
            <div className="text-xs font-medium uppercase tracking-wide text-slate-400">
              {t("panels.layoutHeading")}
            </div>

            <Slider
              label={t("panels.maxWidth")}
              min={480}
              max={2400}
              step={20}
              suffix="px"
              value={config.maxWidth ?? PANEL_LAYOUT_DEFAULTS.maxWidth}
              onChange={(v) => setConfig((c) => ({ ...c, maxWidth: v }))}
            />
            <Slider
              label={t("panels.gap")}
              min={0}
              max={48}
              step={2}
              suffix="px"
              value={config.gap ?? PANEL_LAYOUT_DEFAULTS.gap}
              onChange={(v) => setConfig((c) => ({ ...c, gap: v }))}
            />
            <Slider
              label={t("panels.cardMinHeight")}
              min={0}
              max={320}
              step={10}
              suffix="px"
              hint={
                (config.cardMinHeight ?? 0) === 0 ? t("panels.autoHeight") : undefined
              }
              value={config.cardMinHeight ?? PANEL_LAYOUT_DEFAULTS.cardMinHeight}
              onChange={(v) => setConfig((c) => ({ ...c, cardMinHeight: v }))}
            />

            <label className="block space-y-1 text-sm">
              <span className="text-slate-500">{t("panels.sectionOrder")}</span>
              <select
                className={input}
                value={config.sectionOrder ?? PANEL_LAYOUT_DEFAULTS.sectionOrder}
                onChange={(e) =>
                  setConfig((c) => ({
                    ...c,
                    sectionOrder: e.target.value as "folders" | "links",
                  }))
                }
              >
                <option value="folders">{t("panels.foldersFirst")}</option>
                <option value="links">{t("panels.linksFirst")}</option>
              </select>
            </label>

            <div className="flex flex-wrap gap-3 text-sm">
              {(
                [
                  ["showSearch", t("panels.showSearch")],
                  ["showBreadcrumb", t("panels.showBreadcrumb")],
                  ["showSectionTitles", t("panels.showSectionTitles")],
                  ["showDownload", t("panels.showDownload")],
                ] as const
              ).map(([k, label]) => (
                <label key={k} className="flex items-center gap-1">
                  <input
                    type="checkbox"
                    checked={config[k] !== false}
                    onChange={(e) =>
                      setConfig((c) => ({ ...c, [k]: e.target.checked }))
                    }
                  />
                  {label}
                </label>
              ))}
            </div>
          </div>
        </div>

        <div className="space-y-2 lg:sticky lg:top-2 lg:self-start">
          <span className="text-xs text-slate-500">{t("panels.preview")}</span>
          <TemplatePreview
            config={config}
            desktopLabel={t("panels.previewDesktop")}
            mobileLabel={t("panels.previewMobile")}
          />
        </div>
      </div>

      {err && <div className="mt-2 text-sm text-red-600">{err}</div>}
      <div className="mt-3 flex justify-end gap-2">
        <button onClick={onClose} className="rounded border border-slate-300 px-4 py-2 text-sm dark:border-slate-700">
          {t("common.cancel")}
        </button>
        <button
          onClick={() => save.mutate()}
          disabled={!name.trim() || save.isPending}
          className="rounded bg-slate-900 px-4 py-2 text-sm text-white disabled:opacity-50 dark:bg-slate-100 dark:text-slate-900"
        >
          {save.isPending ? t("common.saving") : t("common.save")}
        </button>
      </div>
    </Modal>
  );
}

/** Range input with its current value shown, for the layout knobs. */
function Slider({
  label,
  value,
  min,
  max,
  step,
  suffix,
  hint,
  onChange,
}: {
  label: string;
  value: number;
  min: number;
  max: number;
  step: number;
  suffix?: string;
  hint?: string;
  onChange: (v: number) => void;
}) {
  return (
    <label className="block space-y-1 text-sm">
      <span className="flex items-center justify-between gap-2">
        <span className="text-slate-500">{label}</span>
        <span className="tabular-nums text-xs text-slate-400">
          {hint ?? `${value}${suffix ?? ""}`}
        </span>
      </span>
      <input
        type="range"
        min={min}
        max={max}
        step={step}
        value={value}
        onChange={(e) => onChange(Number(e.target.value))}
        className="w-full accent-blue-600"
      />
    </label>
  );
}
