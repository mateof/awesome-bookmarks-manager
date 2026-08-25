/**
 * One palette, three uses: the colour of the letters, the colour of the line
 * under them, and the wash behind them.
 *
 * `soft` is the same hue with alpha rather than a pastel of it. A note is read
 * in light mode, in dark mode and inside panels that bring their own
 * background, and an opaque pastel would be right in exactly one of those:
 * pale text on a pale block everywhere else. Translucent keeps what is
 * underneath, so it darkens a dark page and lightens a light one, and the text
 * on top stays whatever colour it already was.
 *
 * Shared by both toolbars, so the phone and the desktop offer the same
 * colours and a note formatted on one does not look different on the other.
 */
export interface RichColor {
  /**
   * Key into `richText.colorName.*`, so a swatch can be named out loud. Typed
   * as the exact union rather than `string`: the translation keys are checked
   * against the Spanish file, and a plain `string` would turn every lookup
   * here into an unchecked one.
   */
  key:
    | "red"
    | "orange"
    | "amber"
    | "green"
    | "teal"
    | "blue"
    | "purple"
    | "pink"
    | "slate";
  /** Letters and underlines: full strength, on top of the background. */
  solid: string;
  /** Highlighter: translucent, because it goes underneath the letters. */
  soft: string;
}

/** The yellow of a marker pen, and what the phone's one-tap highlight uses. */
export const DEFAULT_HIGHLIGHT = "rgba(250, 204, 21, 0.42)";

export const RICH_COLORS: RichColor[] = [
  { key: "red", solid: "#dc2626", soft: "rgba(248, 113, 113, 0.4)" },
  { key: "orange", solid: "#ea580c", soft: "rgba(251, 146, 60, 0.4)" },
  { key: "amber", solid: "#d97706", soft: DEFAULT_HIGHLIGHT },
  { key: "green", solid: "#16a34a", soft: "rgba(74, 222, 128, 0.4)" },
  { key: "teal", solid: "#0d9488", soft: "rgba(45, 212, 191, 0.38)" },
  { key: "blue", solid: "#2563eb", soft: "rgba(96, 165, 250, 0.4)" },
  { key: "purple", solid: "#7c3aed", soft: "rgba(167, 139, 250, 0.42)" },
  { key: "pink", solid: "#db2777", soft: "rgba(244, 114, 182, 0.4)" },
  { key: "slate", solid: "#64748b", soft: "rgba(148, 163, 184, 0.4)" },
];
