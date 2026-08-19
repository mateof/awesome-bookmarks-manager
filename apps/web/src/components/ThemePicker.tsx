import { Check, Download, Trash2, Upload } from "lucide-react";
import { useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import { dlg } from "./dialogs.js";
import {
  BUILTIN_THEMES,
  ThemeFileSchema,
  allThemes,
  currentThemeId,
  customThemes,
  saveCustomThemes,
  setThemeId,
  type Theme,
} from "../themes.js";
import { useTheme } from "../theme.js";

/**
 * Pick an application theme, and import more from a file.
 *
 * The swatch shows the theme in *both* modes at once rather than only the one
 * you are in: a theme's dark side is half of what you are choosing, and having
 * to toggle the whole interface to see it makes comparing ten of them tedious.
 *
 * Themes live in this browser, like the light/dark preference they sit next
 * to. That is a real limitation (a new device starts on the default) and the
 * reason the export button exists: the file is how a theme travels.
 */
export function ThemePicker() {
  const { t } = useTranslation();
  // Selecting a theme rewrites the stylesheet, not React state, so this is
  // only here to re-render the checkmark.
  const [selected, setSelected] = useState(() => currentThemeId());
  const [custom, setCustom] = useState<Theme[]>(() => customThemes());
  const [err, setErr] = useState<string | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);
  const { pref } = useTheme();
  void pref; // re-render the swatches when the light/dark preference changes

  const themes = allThemes();
  const customIds = new Set(custom.map((c) => c.id));

  const pick = (id: string) => {
    setThemeId(id);
    setSelected(id);
  };

  const onFile = async (file: File) => {
    setErr(null);
    let parsed: unknown;
    try {
      parsed = JSON.parse(await file.text());
    } catch {
      setErr(t("themes.errorNotJson"));
      return;
    }
    const result = ThemeFileSchema.safeParse(parsed);
    if (!result.success) {
      setErr(t("themes.errorInvalid"));
      return;
    }
    const incoming = Array.isArray(result.data) ? result.data : [result.data];
    // Re-importing an id replaces it in place, so fixing a colour and
    // importing again does not leave two near-identical entries behind.
    const merged = [
      ...custom.filter((c) => !incoming.some((i) => i.id === c.id)),
      ...incoming,
    ];
    saveCustomThemes(merged);
    setCustom(merged);
    pick(incoming[0]!.id);
  };

  const removeCustom = async (id: string) => {
    if (!(await dlg.confirm({ message: t("themes.confirmRemove"), danger: true })))
      return;
    const merged = custom.filter((c) => c.id !== id);
    saveCustomThemes(merged);
    setCustom(merged);
    if (selected === id) pick("slate");
  };

  const exportCurrent = () => {
    const theme = themes.find((x) => x.id === selected) ?? BUILTIN_THEMES[0]!;
    const blob = new Blob([JSON.stringify(theme, null, 2)], {
      type: "application/json",
    });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `${theme.id}.abtheme.json`;
    document.body.appendChild(a);
    a.click();
    a.remove();
    URL.revokeObjectURL(url);
  };

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
        {themes.map((theme) => (
          <button
            key={theme.id}
            type="button"
            onClick={() => pick(theme.id)}
            aria-pressed={selected === theme.id}
            className={`group relative overflow-hidden rounded-xl border text-left transition hover:shadow-md ${
              selected === theme.id
                ? "border-blue-500 ring-2 ring-blue-500/40"
                : "border-slate-300 dark:border-slate-700"
            }`}
          >
            <Swatch theme={theme} />
            <span className="flex items-center gap-1 px-3 py-2 text-sm font-medium">
              {selected === theme.id && (
                <Check className="h-3.5 w-3.5 text-blue-500" />
              )}
              <span className="min-w-0 flex-1 truncate">{theme.name}</span>
              {customIds.has(theme.id) && (
                <span
                  role="button"
                  tabIndex={0}
                  title={t("themes.remove")}
                  onClick={(e) => {
                    e.stopPropagation();
                    void removeCustom(theme.id);
                  }}
                  onKeyDown={(e) => {
                    if (e.key === "Enter") {
                      e.stopPropagation();
                      void removeCustom(theme.id);
                    }
                  }}
                  className="shrink-0 rounded p-0.5 text-slate-400 hover:text-red-600"
                >
                  <Trash2 className="h-3.5 w-3.5" />
                </span>
              )}
            </span>
          </button>
        ))}
      </div>

      {err && (
        <div className="rounded bg-red-50 p-2 text-sm text-red-700 dark:bg-red-950 dark:text-red-300">
          {err}
        </div>
      )}

      <div className="flex flex-wrap gap-2">
        <button
          type="button"
          onClick={() => fileRef.current?.click()}
          className="flex items-center gap-1 rounded border border-slate-300 px-3 py-1.5 text-sm hover:bg-slate-100 dark:border-slate-700 dark:hover:bg-slate-800"
        >
          <Upload className="h-4 w-4" /> {t("themes.import")}
        </button>
        <button
          type="button"
          onClick={exportCurrent}
          className="flex items-center gap-1 rounded border border-slate-300 px-3 py-1.5 text-sm hover:bg-slate-100 dark:border-slate-700 dark:hover:bg-slate-800"
        >
          <Download className="h-4 w-4" /> {t("themes.export")}
        </button>
      </div>
      <input
        ref={fileRef}
        type="file"
        accept="application/json,.json"
        className="hidden"
        onChange={(e) => {
          const f = e.target.files?.[0];
          e.target.value = "";
          if (f) void onFile(f);
        }}
      />
      <p className="text-xs text-slate-500">{t("themes.storageHint")}</p>
    </div>
  );
}

/** Both halves of a theme side by side: light on the left, dark on the right. */
function Swatch({ theme }: { theme: Theme }) {
  const dark = theme.darkNeutral ?? theme.neutral;
  const { t } = useTranslation();
  return (
    <span className="flex h-16 w-full" aria-hidden>
      <span
        className="flex flex-1 flex-col justify-between p-1.5"
        style={{ background: theme.white }}
      >
        <span className="flex gap-1">
          <Dot color={theme.accent[500]} />
          <Dot color={theme.neutral[300]} />
        </span>
        <span
          className="text-[9px] font-semibold uppercase tracking-wide"
          style={{ color: theme.neutral[700] }}
        >
          {t("themes.lightShort")}
        </span>
      </span>
      <span
        className="flex flex-1 flex-col justify-between p-1.5"
        style={{ background: dark[900] }}
      >
        <span className="flex gap-1">
          <Dot color={theme.accent[400]} />
          <Dot color={dark[700]} />
        </span>
        <span
          className="text-right text-[9px] font-semibold uppercase tracking-wide"
          style={{ color: dark[200] }}
        >
          {t("themes.darkShort")}
        </span>
      </span>
    </span>
  );
}

function Dot({ color }: { color: string }) {
  return (
    <span
      className="h-3 w-3 rounded-full ring-1 ring-black/10"
      style={{ background: color }}
    />
  );
}
