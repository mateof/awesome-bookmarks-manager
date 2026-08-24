import type { TemplateConfig } from "@awesome-bookmarks/shared";
import { Moon, Palette, Sun } from "lucide-react";
import { useTranslation } from "react-i18next";
import type { PanelScheme } from "../lib/panelScheme.js";

/**
 * Read this panel in light, in dark, or as it was made.
 *
 * Styled inline from the template rather than with the app's classes, because
 * a public panel is rendered for people with no session and no app chrome
 * around it: the whole page is the panel, and a control that took its colours
 * from somewhere else would look pasted on.
 */
export function PanelSchemeToggle({
  value,
  onChange,
  theme,
}: {
  value: PanelScheme;
  onChange: (next: PanelScheme) => void;
  theme: TemplateConfig["theme"];
}) {
  const { t } = useTranslation();
  const options: { id: PanelScheme; icon: React.ReactNode; label: string }[] = [
    {
      id: "original",
      icon: <Palette size={14} />,
      label: t("panelScheme.original"),
    },
    { id: "light", icon: <Sun size={14} />, label: t("panelScheme.light") },
    { id: "dark", icon: <Moon size={14} />, label: t("panelScheme.dark") },
  ];

  return (
    <div
      role="group"
      aria-label={t("panelScheme.group")}
      style={{
        display: "inline-flex",
        alignItems: "center",
        gap: 2,
        padding: 2,
        borderRadius: "0.6rem",
        background: theme.surface,
        border: `1px solid ${theme.border}`,
      }}
    >
      {options.map((o) => {
        const on = value === o.id;
        return (
          <button
            key={o.id}
            type="button"
            onClick={() => onChange(o.id)}
            title={o.label}
            aria-label={o.label}
            aria-pressed={on}
            style={{
              display: "flex",
              alignItems: "center",
              gap: 4,
              padding: "0.25rem 0.5rem",
              borderRadius: "0.45rem",
              border: "none",
              cursor: "pointer",
              fontFamily: "inherit",
              fontSize: 12,
              background: on ? theme.accent : "transparent",
              color: on ? theme.surface : theme.muted,
            }}
          >
            {o.icon}
          </button>
        );
      })}
    </div>
  );
}
