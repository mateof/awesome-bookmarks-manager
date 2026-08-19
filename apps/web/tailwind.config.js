import typography from "@tailwindcss/typography";

/**
 * `slate`, `white` and `blue` are the interface's palette — 87% of every colour
 * utility in the app — so they resolve to CSS variables instead of fixed hex.
 * That is what makes a theme a set of values (see src/themes.ts) rather than a
 * rewrite of every component.
 *
 * The semantic colours (red for danger, amber for warning, emerald/green for
 * success) stay fixed on purpose: a theme should restyle the chrome, not make
 * "delete" stop looking dangerous.
 */
const STOPS = [50, 100, 200, 300, 400, 500, 600, 700, 800, 900, 950];

const ramp = (prefix) =>
  Object.fromEntries(
    STOPS.map((s) => [s, `rgb(var(--c-${prefix}-${s}) / <alpha-value>)`]),
  );

/** @type {import('tailwindcss').Config} */
export default {
  content: ["./index.html", "./src/**/*.{ts,tsx}"],
  theme: {
    extend: {
      colors: {
        slate: ramp("n"),
        blue: ramp("a"),
        white: "rgb(var(--c-white) / <alpha-value>)",
      },
    },
  },
  plugins: [typography],
  darkMode: "class",
};
