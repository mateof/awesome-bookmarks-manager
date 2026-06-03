import {
  LayoutGrid,
  LayoutList,
  Rows3,
  Square,
  Table,
} from "lucide-react";
import { useTranslation } from "react-i18next";
import { useViewMode, type ViewMode } from "../view-mode.js";

const MODES: { mode: ViewMode; icon: React.ReactNode }[] = [
  { mode: "grid", icon: <LayoutGrid className="h-4 w-4" /> },
  { mode: "list", icon: <LayoutList className="h-4 w-4" /> },
  { mode: "large", icon: <Square className="h-4 w-4" /> },
  { mode: "table", icon: <Table className="h-4 w-4" /> },
  { mode: "mosaic", icon: <Rows3 className="h-4 w-4" /> },
];

export function ViewModeToggle() {
  const { t } = useTranslation();
  const { mode, setMode } = useViewMode();
  return (
    <div className="flex overflow-hidden rounded border border-slate-300 dark:border-slate-700">
      {MODES.map((m) => {
        const label = t(`viewMode.${m.mode}`);
        return (
          <button
            key={m.mode}
            type="button"
            aria-label={label}
            title={label}
            onClick={() => setMode(m.mode)}
            className={`px-2 py-1 ${
              mode === m.mode
                ? "bg-slate-900 text-white dark:bg-slate-100 dark:text-slate-900"
                : "text-slate-500 hover:bg-slate-100 dark:hover:bg-slate-800"
            }`}
          >
            {m.icon}
          </button>
        );
      })}
    </div>
  );
}
