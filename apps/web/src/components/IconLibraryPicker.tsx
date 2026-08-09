import { type MouseEvent, type ReactNode, useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import {
  ICON_TILE_COLORS,
  composeIconSvg,
  svgFile,
} from "../lib/appearance.js";
import {
  COMMON_ICONS,
  ICON_CATEGORIES,
  type LibIcon,
  searchIcons,
} from "../lib/iconLibrary.js";

function Chip({
  active,
  onClick,
  children,
}: {
  active: boolean;
  onClick: () => void;
  children: ReactNode;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`shrink-0 rounded-full px-2.5 py-1 text-xs ${
        active
          ? "bg-slate-900 text-white dark:bg-slate-100 dark:text-slate-900"
          : "bg-slate-100 text-slate-600 hover:bg-slate-200 dark:bg-slate-800 dark:text-slate-300 dark:hover:bg-slate-700"
      }`}
    >
      {children}
    </button>
  );
}

/**
 * Pick a glyph from the curated lucide library, composed onto a coloured tile
 * and handed to `onPick` as an SVG File (uploaded through the normal pipeline).
 */
export function IconLibraryPicker({
  onPick,
  busy,
}: {
  onPick: (file: File) => Promise<void> | void;
  busy?: boolean;
}) {
  const { t } = useTranslation();
  const [color, setColor] = useState(ICON_TILE_COLORS[0]!);
  const [cat, setCat] = useState<string>("__common");
  const [q, setQ] = useState("");

  const icons: LibIcon[] = useMemo(() => {
    if (q.trim()) return searchIcons(q);
    if (cat === "__common") return COMMON_ICONS;
    return ICON_CATEGORIES.find((c) => c.key === cat)?.icons ?? [];
  }, [q, cat]);

  const pick = async (e: MouseEvent<HTMLButtonElement>) => {
    const svgEl = e.currentTarget.querySelector("svg");
    if (!svgEl) return;
    await onPick(svgFile(composeIconSvg(svgEl.innerHTML, color), "icon.svg"));
  };

  return (
    <div className="space-y-2">
      <div className="flex flex-wrap items-center gap-1.5">
        {ICON_TILE_COLORS.map((c) => (
          <button
            key={c}
            type="button"
            onClick={() => setColor(c)}
            aria-label={c}
            className={`h-6 w-6 rounded-full border-2 ${
              color === c
                ? "border-slate-900 dark:border-white"
                : "border-transparent"
            }`}
            style={{ backgroundColor: c }}
          />
        ))}
      </div>

      <input
        value={q}
        onChange={(e) => setQ(e.target.value)}
        placeholder={t("iconLib.search")}
        className="w-full rounded border border-slate-300 bg-white px-2 py-1 text-sm dark:border-slate-700 dark:bg-slate-800"
      />

      {!q.trim() && (
        <div className="no-scrollbar flex gap-1 overflow-x-auto">
          <Chip active={cat === "__common"} onClick={() => setCat("__common")}>
            {t("iconLib.common")}
          </Chip>
          {ICON_CATEGORIES.map((c) => (
            <Chip
              key={c.key}
              active={cat === c.key}
              onClick={() => setCat(c.key)}
            >
              {t(`iconLib.cat.${c.key}` as "iconLib.cat.general")}
            </Chip>
          ))}
        </div>
      )}

      <div className="grid max-h-44 grid-cols-8 gap-1 overflow-y-auto">
        {icons.map(({ name, Icon }) => (
          <button
            key={name}
            type="button"
            title={name}
            disabled={busy}
            onClick={pick}
            className="flex items-center justify-center rounded-lg p-2 text-white transition hover:scale-105 hover:ring-2 hover:ring-slate-300 disabled:opacity-50 dark:hover:ring-slate-600"
            style={{ backgroundColor: color }}
          >
            <Icon className="h-5 w-5" />
          </button>
        ))}
      </div>
    </div>
  );
}
