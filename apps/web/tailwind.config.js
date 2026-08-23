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
      /**
       * Shape goes through variables for the same reason colour does: so a
       * theme can change the *form* of every card, button and input without
       * anybody editing a component. `--shape-radius` is a multiplier, so one
       * number takes the interface from square to pill and every step keeps
       * its proportion to the others.
       *
       * `full` is deliberately not multiplied: a round avatar is round in
       * every theme, and scaling 9999px means nothing.
       */
      borderRadius: {
        none: "0px",
        sm: "calc(0.125rem * var(--shape-radius))",
        DEFAULT: "calc(0.25rem * var(--shape-radius))",
        md: "calc(0.375rem * var(--shape-radius))",
        lg: "calc(0.5rem * var(--shape-radius))",
        xl: "calc(0.75rem * var(--shape-radius))",
        "2xl": "calc(1rem * var(--shape-radius))",
        "3xl": "calc(1.5rem * var(--shape-radius))",
        full: "9999px",
      },
      // Named rather than computed: "flat", "hard" and "glow" are different
      // kinds of shadow, not different amounts of one.
      boxShadow: {
        sm: "var(--shadow-sm)",
        DEFAULT: "var(--shadow)",
        md: "var(--shadow-md)",
        lg: "var(--shadow-lg)",
        xl: "var(--shadow-lg)",
      },
      borderWidth: {
        DEFAULT: "var(--shape-border)",
      },
      fontFamily: {
        sans: "var(--font-body)",
      },
    },
  },
  plugins: [typography],
  darkMode: "class",
};
