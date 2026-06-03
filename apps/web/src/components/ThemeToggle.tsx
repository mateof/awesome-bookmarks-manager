import { Monitor, Moon, Sun } from "lucide-react";
import { useTranslation } from "react-i18next";
import { useTheme, type ThemePref } from "../theme.js";

const NEXT: Record<ThemePref, ThemePref> = {
  system: "light",
  light: "dark",
  dark: "system",
};

const ICONS: Record<ThemePref, React.ReactNode> = {
  system: <Monitor className="h-4 w-4" />,
  light: <Sun className="h-4 w-4" />,
  dark: <Moon className="h-4 w-4" />,
};

export function ThemeToggle() {
  const { t } = useTranslation();
  const { pref, setPref } = useTheme();
  const label = t(`theme.${pref}`);
  return (
    <button
      type="button"
      onClick={() => setPref(NEXT[pref])}
      title={`${label} ${t("theme.cycleHint")}`}
      aria-label={label}
      className="rounded p-1.5 text-slate-500 hover:bg-slate-100 hover:text-slate-900 dark:hover:bg-slate-800 dark:hover:text-slate-100"
    >
      {ICONS[pref]}
    </button>
  );
}
