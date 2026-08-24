import type { TemplateConfig } from "@awesome-bookmarks/shared";

/**
 * Reading a panel in light or dark, whatever it was designed in.
 *
 * A panel's colours are **fixed strings on its template** — `bg` is often a
 * gradient — and they do not answer to the `dark` class the rest of the app
 * uses. Some built-in templates are light, some are dark, and a custom one is
 * whatever its author typed. So "dark mode" here cannot mean flipping a class,
 * and deriving a dark variant of an arbitrary gradient is guesswork that goes
 * wrong the first time somebody writes a three-stop radial.
 *
 * Instead the two forced schemes **replace** the palette with a plain one and
 * leave everything else about the template alone: layout, card shape, columns.
 * `original` is the panel exactly as its author made it, and is the default.
 *
 * The choice is remembered per panel rather than globally, because that is what
 * makes one panel readable at night without dragging every other panel with it.
 */
export type PanelScheme = "original" | "light" | "dark";

type Palette = TemplateConfig["theme"];

const PALETTES: Record<"light" | "dark", Palette> = {
  light: {
    bg: "#f8fafc",
    surface: "#ffffff",
    text: "#0f172a",
    muted: "#64748b",
    accent: "#2563eb",
    border: "#e2e8f0",
  },
  dark: {
    bg: "#0b1020",
    surface: "#131a2e",
    text: "#e5e7eb",
    muted: "#94a3b8",
    accent: "#60a5fa",
    border: "#26304d",
  },
};

const KEY = (slug: string) => `panel.scheme.${slug}`;

export function readPanelScheme(slug: string | undefined): PanelScheme {
  if (!slug || typeof localStorage === "undefined") return "original";
  const raw = localStorage.getItem(KEY(slug));
  return raw === "light" || raw === "dark" ? raw : "original";
}

export function writePanelScheme(slug: string, scheme: PanelScheme): void {
  try {
    if (scheme === "original") localStorage.removeItem(KEY(slug));
    else localStorage.setItem(KEY(slug), scheme);
  } catch {
    /* private mode: the choice just does not survive the tab */
  }
}

/**
 * The template to render with, once the reader's choice is applied.
 *
 * A forced scheme also drops the decorative scene. Those are built to sit
 * behind the palette they shipped with — a night-sky scene under a plain white
 * page is not "the same panel in light mode", it is a broken one. An uploaded
 * background image is left alone: that is the author's own content rather than
 * a decoration chosen to match the colours.
 */
export function applyPanelScheme(
  template: TemplateConfig,
  scheme: PanelScheme,
): TemplateConfig {
  if (scheme === "original") return template;
  return { ...template, theme: PALETTES[scheme], scene: "none" };
}
