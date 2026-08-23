import { z } from "zod";

/**
 * Application themes.
 *
 * The whole interface is written against Tailwind's `slate`, `white` and
 * `blue` classes — 87% of every colour utility in the app — so a theme does
 * not need components to change: those three families resolve to CSS variables
 * (see tailwind.config.js) and a theme is nothing but a set of values for them.
 *
 * Each theme ships one neutral ramp and one accent ramp, 50 → 950. Light and
 * dark fall out of that for free, because the components already pick low
 * stops for light surfaces and high stops for dark ones (`bg-white
 * dark:bg-slate-900`). A theme whose dark side wants a different temperature
 * than its light side adds `darkNeutral`; the rest reuse the one ramp.
 *
 * Ramps are generated in OKLCH from the lightness/chroma envelope of Tailwind's
 * own slate and blue, so every theme keeps the contrast relationships the
 * interface was designed with instead of each one being eyeballed.
 *
 * The palettes are original values, not copies of the well-known editor
 * themes they nod to: that keeps the licence question from arising at all.
 */

const STOPS = [
  50, 100, 200, 300, 400, 500, 600, 700, 800, 900, 950,
] as const;

const RampSchema = z.object({
  50: z.string(), 100: z.string(), 200: z.string(), 300: z.string(),
  400: z.string(), 500: z.string(), 600: z.string(), 700: z.string(),
  800: z.string(), 900: z.string(), 950: z.string(),
});

/**
 * The shape half of a theme.
 *
 * A palette alone makes ten themes that are the same interface in ten colours.
 * These five knobs change what a card *is* — how round, how heavy its edge, how
 * it sits off the page, what it is set in, and how the frame around it is
 * treated — which is the difference between a recolour and a theme.
 *
 * Every field is optional and defaults to the interface as originally drawn, so
 * a theme file that says nothing about shape keeps working exactly as before.
 *
 * Fonts are **system stacks only**. A self-hosted app that reaches out to a
 * font CDN leaks a request to every visitor of every public panel, and stops
 * rendering properly on an instance with no internet access.
 */
export const ShapeSchema = z.object({
  /** Multiplies every corner radius. 0 square, 1 as designed, 2 pill-like. */
  radius: z.number().min(0).max(3).default(1),
  /** Edge weight, e.g. "1px" (hairline) or "2px" (drawn). */
  border: z.string().default("1px"),
  /**
   * How surfaces sit off the page. Named rather than numeric because these are
   * different *kinds* of shadow, not different amounts of one: `hard` is an
   * offset solid, `glow` is coloured by the accent.
   */
  elevation: z.enum(["flat", "soft", "hard", "glow"]).default("soft"),
  font: z.enum(["sans", "serif", "mono"]).default("sans"),
  /**
   * The header and footer. `plain` is the page surface, `tinted` a wash of the
   * accent, `solid` the accent itself, `bare` no surface and no edge at all.
   */
  chrome: z.enum(["plain", "tinted", "solid", "bare"]).default("plain"),
});
export type Shape = z.infer<typeof ShapeSchema>;

export const ThemeSchema = z.object({
  id: z.string().trim().min(1).max(40),
  name: z.string().trim().min(1).max(60),
  /** The base surface: what `bg-white` and `text-white` resolve to. */
  white: z.string(),
  neutral: RampSchema,
  accent: RampSchema,
  /** Optional different neutral ramp for dark mode. */
  darkNeutral: RampSchema.optional(),
  /** Optional; omitted means the interface as originally drawn. */
  shape: ShapeSchema.optional(),
});
export type Theme = z.infer<typeof ThemeSchema>;

/** A file may hold one theme or several. */
export const ThemeFileSchema = z.union([ThemeSchema, z.array(ThemeSchema).max(50)]);

export const BUILTIN_THEMES: Theme[] = [
  {
    id: "slate",
    name: "Pizarra",
    /** The reference. Everything else is a departure from this. */
    shape: { radius: 1, border: "1px", elevation: "soft", font: "sans", chrome: "plain" },
    white: "#ffffff",
    neutral: {
      "50": "#f8fafc",
      "100": "#f1f5f9",
      "200": "#e2e8f0",
      "300": "#cbd5e1",
      "400": "#94a3b8",
      "500": "#64748b",
      "600": "#475569",
      "700": "#334155",
      "800": "#1e293b",
      "900": "#0f172a",
      "950": "#020617",
    },
    accent: {
      "50": "#eff6ff",
      "100": "#dbeafe",
      "200": "#bfdbfe",
      "300": "#93c5fd",
      "400": "#60a5fa",
      "500": "#3b82f6",
      "600": "#2563eb",
      "700": "#1d4ed8",
      "800": "#1e40af",
      "900": "#1e3a8a",
      "950": "#172554",
    },
  },
  {
    id: "nordic",
    name: "Nórdico",
    /** Soft and printed flat: generous corners, no shadow at all. */
    shape: { radius: 1.6, border: "1px", elevation: "flat", font: "sans", chrome: "tinted" },
    white: "#fafcff",
    neutral: {
      "50": "#f3fbff",
      "100": "#ecf6fc",
      "200": "#dceaf2",
      "300": "#c6d7e1",
      "400": "#92a5b0",
      "500": "#627682",
      "600": "#445762",
      "700": "#31434d",
      "800": "#1c2b33",
      "900": "#0d1a21",
      "950": "#02080d",
    },
    accent: {
      "50": "#f0f6f8",
      "100": "#dcecf0",
      "200": "#c2dee5",
      "300": "#9bcad5",
      "400": "#65adbe",
      "500": "#2796ad",
      "600": "#00809a",
      "700": "#006f88",
      "800": "#005a70",
      "900": "#004c5b",
      "950": "#002f39",
    },
    darkNeutral: {
      "50": "#f1fcff",
      "100": "#e9f7fe",
      "200": "#d9ebf4",
      "300": "#c1d8e3",
      "400": "#8ca7b3",
      "500": "#5c7884",
      "600": "#3e5965",
      "700": "#2b444f",
      "800": "#162c35",
      "900": "#081a22",
      "950": "#01090e",
    },
  },
  {
    id: "sepia",
    name: "Sepia",
    /** Paper. Serif text, barely-rounded corners, nothing floating. */
    shape: { radius: 0.5, border: "1px", elevation: "flat", font: "serif", chrome: "tinted" },
    white: "#fdfaf3",
    neutral: {
      "50": "#fff9f1",
      "100": "#fbf3e9",
      "200": "#f0e6d9",
      "300": "#ded2c2",
      "400": "#ada08d",
      "500": "#7f705d",
      "600": "#5f523f",
      "700": "#4a3e2d",
      "800": "#312718",
      "900": "#1f160a",
      "950": "#0c0601",
    },
    accent: {
      "50": "#faf4ee",
      "100": "#f5e5d9",
      "200": "#edd3bc",
      "300": "#e2b793",
      "400": "#cf925a",
      "500": "#c07119",
      "600": "#ad5500",
      "700": "#9b4300",
      "800": "#7f3700",
      "900": "#683200",
      "950": "#402000",
    },
    darkNeutral: {
      "50": "#fff7f5",
      "100": "#fdf1ee",
      "200": "#f3e4e0",
      "300": "#e2cfca",
      "400": "#b29c97",
      "500": "#836d67",
      "600": "#644f49",
      "700": "#4e3b36",
      "800": "#342420",
      "900": "#211411",
      "950": "#0d0504",
    },
  },
  {
    id: "forest",
    name: "Bosque",
    /** Organic: the roundest of the soft themes. */
    shape: { radius: 2, border: "1px", elevation: "soft", font: "sans", chrome: "tinted" },
    white: "#f9fcf7",
    neutral: {
      "50": "#f6fbf5",
      "100": "#f0f7ef",
      "200": "#e2eae0",
      "300": "#cdd8cb",
      "400": "#9aa697",
      "500": "#6a7768",
      "600": "#4c584a",
      "700": "#394437",
      "800": "#222c20",
      "900": "#131a11",
      "950": "#040904",
    },
    accent: {
      "50": "#f1f7f2",
      "100": "#dfede1",
      "200": "#c7e0cb",
      "300": "#a5ccac",
      "400": "#76b182",
      "500": "#4b9b5f",
      "600": "#1f8642",
      "700": "#007431",
      "800": "#005f28",
      "900": "#124f26",
      "950": "#0f3119",
    },
    darkNeutral: {
      "50": "#f4fcf6",
      "100": "#edf8f0",
      "200": "#deece2",
      "300": "#c7d9cd",
      "400": "#93a89a",
      "500": "#63796a",
      "600": "#455a4c",
      "700": "#334639",
      "800": "#1d2d22",
      "900": "#0e1b13",
      "950": "#020904",
    },
  },
  {
    id: "cacao",
    name: "Cacao",
    /** Drawn rather than lit: a heavy edge and a solid band of accent. */
    shape: { radius: 0.75, border: "2px", elevation: "flat", font: "serif", chrome: "solid" },
    white: "#fdf9f5",
    neutral: {
      "50": "#fff7f3",
      "100": "#fff1ec",
      "200": "#f5e3dc",
      "300": "#e4cfc6",
      "400": "#b49c91",
      "500": "#856c62",
      "600": "#664e44",
      "700": "#503b31",
      "800": "#36241c",
      "900": "#22140d",
      "950": "#0e0502",
    },
    accent: {
      "50": "#fcf3f0",
      "100": "#f9e3de",
      "200": "#f5cec5",
      "300": "#edb0a2",
      "400": "#dd8673",
      "500": "#cf614b",
      "600": "#bd4027",
      "700": "#aa2a10",
      "800": "#8c230e",
      "900": "#722516",
      "950": "#461910",
    },
    darkNeutral: {
      "50": "#fff7f3",
      "100": "#fff1ec",
      "200": "#f7e3dc",
      "300": "#e6cec5",
      "400": "#b79b91",
      "500": "#886b61",
      "600": "#684d43",
      "700": "#523a31",
      "800": "#37231c",
      "900": "#24130d",
      "950": "#0f0402",
    },
  },
  {
    id: "nocturne",
    name: "Nocturno",
    /** Night-time reading; the shape stays out of the way. */
    shape: { radius: 1.2, border: "1px", elevation: "soft", font: "sans", chrome: "plain" },
    white: "#fcfaff",
    neutral: {
      "50": "#faf8ff",
      "100": "#f5f3fd",
      "200": "#e8e5f3",
      "300": "#d5d1e2",
      "400": "#a39fb1",
      "500": "#747083",
      "600": "#555163",
      "700": "#413d4e",
      "800": "#292634",
      "900": "#181621",
      "950": "#08060d",
    },
    accent: {
      "50": "#f6f3fc",
      "100": "#ebe5f9",
      "200": "#ddd1f5",
      "300": "#c8b5ee",
      "400": "#ac8ee1",
      "500": "#976dd8",
      "600": "#834fc9",
      "700": "#723bb7",
      "800": "#5d3096",
      "900": "#4d2e79",
      "950": "#301e4a",
    },
    darkNeutral: {
      "50": "#f8f9ff",
      "100": "#f3f3ff",
      "200": "#e5e5f9",
      "300": "#d1d1ea",
      "400": "#9f9fbb",
      "500": "#706f8d",
      "600": "#51516d",
      "700": "#3e3d56",
      "800": "#27263b",
      "900": "#161527",
      "950": "#060611",
    },
  },
  {
    id: "rose",
    name: "Rosa seca",
    /** No edges at all: shape comes from the shadow and the curve. */
    shape: { radius: 2.2, border: "0px", elevation: "soft", font: "sans", chrome: "tinted" },
    white: "#fffafb",
    neutral: {
      "50": "#fff7f9",
      "100": "#fcf1f3",
      "200": "#f1e3e6",
      "300": "#e0cfd2",
      "400": "#af9ca0",
      "500": "#816d71",
      "600": "#614e52",
      "700": "#4c3b3e",
      "800": "#322427",
      "900": "#201417",
      "950": "#0c0506",
    },
    accent: {
      "50": "#fbf3f4",
      "100": "#f7e3e6",
      "200": "#f1ced3",
      "300": "#e6b0b9",
      "400": "#d48795",
      "500": "#c56479",
      "600": "#b24660",
      "700": "#a03350",
      "800": "#832941",
      "900": "#6b2838",
      "950": "#421b23",
    },
    darkNeutral: {
      "50": "#fff7fb",
      "100": "#fdf1f6",
      "200": "#f2e3e9",
      "300": "#e1ced6",
      "400": "#b19ba4",
      "500": "#826b75",
      "600": "#624d57",
      "700": "#4d3a42",
      "800": "#33232a",
      "900": "#201319",
      "950": "#0d0508",
    },
  },
  {
    id: "contrast",
    name: "Alto contraste",
    /** Square and outlined. Shape carries the information a low-vision
     *   reader needs when colour alone will not. */
    shape: { radius: 0, border: "2px", elevation: "flat", font: "sans", chrome: "solid" },
    white: "#ffffff",
    neutral: {
      "50": "#fafafa",
      "100": "#f4f4f4",
      "200": "#e7e7e7",
      "300": "#d4d4d4",
      "400": "#a2a2a2",
      "500": "#737373",
      "600": "#545454",
      "700": "#404040",
      "800": "#292929",
      "900": "#181818",
      "950": "#070707",
    },
    accent: {
      "50": "#eef6ff",
      "100": "#d7ebff",
      "200": "#b9dcff",
      "300": "#8dc6ff",
      "400": "#4ba5fb",
      "500": "#0088f9",
      "600": "#006ded",
      "700": "#0059db",
      "800": "#0049b3",
      "900": "#00408f",
      "950": "#002958",
    },
  },
  {
    id: "ocean",
    name: "Océano",
    /** Borderless and buoyant. */
    shape: { radius: 1.5, border: "0px", elevation: "soft", font: "sans", chrome: "tinted" },
    white: "#f7fcfd",
    neutral: {
      "50": "#f2fcff",
      "100": "#eaf7fb",
      "200": "#daebf0",
      "300": "#c3d8de",
      "400": "#8ea7ad",
      "500": "#5e787f",
      "600": "#40595f",
      "700": "#2d454a",
      "800": "#182c31",
      "900": "#0a1b1f",
      "950": "#01090c",
    },
    accent: {
      "50": "#eef7f7",
      "100": "#d9eded",
      "200": "#bbe1e0",
      "300": "#8fcecd",
      "400": "#4bb3b3",
      "500": "#009d9e",
      "600": "#00888a",
      "700": "#007779",
      "800": "#006163",
      "900": "#005152",
      "950": "#003233",
    },
    darkNeutral: {
      "50": "#f0fdfe",
      "100": "#e8f8fa",
      "200": "#d7ecef",
      "300": "#bfdadd",
      "400": "#8aa8ac",
      "500": "#58797d",
      "600": "#3a5a5e",
      "700": "#284649",
      "800": "#132d30",
      "900": "#061c1e",
      "950": "#00090b",
    },
  },
  {
    id: "neon",
    name: "Neón",
    /** Monospace, hard corners, and light that comes off the accent
     *   instead of a grey drop shadow. */
    shape: { radius: 0.5, border: "1px", elevation: "glow", font: "mono", chrome: "bare" },
    white: "#fcfaff",
    neutral: {
      "50": "#f7faff",
      "100": "#f1f4fd",
      "200": "#e3e7f2",
      "300": "#cfd4e1",
      "400": "#9ca1b1",
      "500": "#6d7282",
      "600": "#4e5463",
      "700": "#3b404e",
      "800": "#242834",
      "900": "#141721",
      "950": "#05070d",
    },
    accent: {
      "50": "#fbf2fa",
      "100": "#f6e1f3",
      "200": "#f0caeb",
      "300": "#e5aadf",
      "400": "#d27dcb",
      "500": "#c353bc",
      "600": "#b02aab",
      "700": "#9e0499",
      "800": "#81087d",
      "900": "#6a1866",
      "950": "#42133f",
    },
    darkNeutral: {
      "50": "#f4faff",
      "100": "#edf5ff",
      "200": "#dee8fc",
      "300": "#c8d4ec",
      "400": "#95a2be",
      "500": "#657390",
      "600": "#47546f",
      "700": "#344059",
      "800": "#1f283d",
      "900": "#101728",
      "950": "#030712",
    },
  },
  {
    id: "brutal",
    name: "Brutalista",
    /** Square, thick-edged and lit by an offset solid rather than a blur.
     *   The one theme where a card looks stuck onto the page instead of
     *   floating above it. */
    shape: { radius: 0, border: "3px", elevation: "hard", font: "sans", chrome: "solid" },
    white: "#fffdfa",
    neutral: {
      "50": "#fafaf9",
      "100": "#f6f4f2",
      "200": "#eae7e3",
      "300": "#d7d3ce",
      "400": "#a8a097",
      "500": "#797267",
      "600": "#5a534a",
      "700": "#463f36",
      "800": "#2e2820",
      "900": "#1d170f",
      "950": "#0b0602",
    },
    accent: {
      "50": "#fdf3ec",
      "100": "#fae4d4",
      "200": "#f6d0b4",
      "300": "#f0b182",
      "400": "#e4893a",
      "500": "#c86c00",
      "600": "#a75900",
      "700": "#8f4c00",
      "800": "#763d00",
      "900": "#653300",
      "950": "#411f00",
    },
  },
  {
    id: "terminal",
    name: "Terminal",
    /** Monospace on near-black, hard corners, no shadow anywhere. Reads as a
     *   console, which is the point. */
    shape: { radius: 0, border: "1px", elevation: "flat", font: "mono", chrome: "bare" },
    white: "#fbfdfb",
    neutral: {
      "50": "#f9faf9",
      "100": "#f3f5f4",
      "200": "#e5e8e6",
      "300": "#d0d5d2",
      "400": "#9ba49e",
      "500": "#6c766f",
      "600": "#4e5750",
      "700": "#3a433d",
      "800": "#232b26",
      "900": "#121a15",
      "950": "#030905",
    },
    accent: {
      "50": "#eff8f0",
      "100": "#daefde",
      "200": "#bee3c5",
      "300": "#94d2a0",
      "400": "#56bb71",
      "500": "#00a24a",
      "600": "#00873d",
      "700": "#007433",
      "800": "#005f28",
      "900": "#005121",
      "950": "#003313",
    },
  },
  {
    id: "burbuja",
    name: "Burbuja",
    /** Everything is a pill: maximum radius, no edges, soft shadow. The
     *   furthest this interface goes from a rectangle. */
    shape: { radius: 3, border: "0px", elevation: "soft", font: "sans", chrome: "bare" },
    white: "#fffdfe",
    neutral: {
      "50": "#faf9fa",
      "100": "#f6f4f6",
      "200": "#eae6e9",
      "300": "#d8d2d7",
      "400": "#a89ea7",
      "500": "#7a6f79",
      "600": "#5a5059",
      "700": "#463d45",
      "800": "#2e262d",
      "900": "#1d151c",
      "950": "#0b050b",
    },
    accent: {
      "50": "#fdf2f7",
      "100": "#f9e1ed",
      "200": "#f5cae1",
      "300": "#eea8cf",
      "400": "#e17bb7",
      "500": "#d14da1",
      "600": "#bf1e8c",
      "700": "#a8007a",
      "800": "#8b0064",
      "900": "#701752",
      "950": "#451333",
    },
  },
  {
    id: "prensa",
    name: "Prensa",
    /** Editorial: serif text, square corners, hairline rules and no shadow,
     *   like a broadsheet. */
    shape: { radius: 0, border: "1px", elevation: "flat", font: "serif", chrome: "plain" },
    white: "#fffefb",
    neutral: {
      "50": "#fafaf9",
      "100": "#f5f4f3",
      "200": "#e9e7e5",
      "300": "#d6d3d0",
      "400": "#a6a19b",
      "500": "#78726b",
      "600": "#58534d",
      "700": "#443f3a",
      "800": "#2c2823",
      "900": "#1b1712",
      "950": "#0a0603",
    },
    accent: {
      "50": "#fef2f0",
      "100": "#fce2dd",
      "200": "#facbc5",
      "300": "#f6aaa0",
      "400": "#eb7f72",
      "500": "#de5145",
      "600": "#cd221f",
      "700": "#b6000b",
      "800": "#960309",
      "900": "#791915",
      "950": "#4a1410",
    },
  },
];

/* ------------------------------------------------------------------ */
/* Applying a theme                                                    */
/* ------------------------------------------------------------------ */

const STORAGE_KEY = "palette";
const CUSTOM_KEY = "palette.custom";

/** A theme's shape with the defaults filled in. */
export function shapeOf(theme: Theme): Shape {
  return ShapeSchema.parse(theme.shape ?? {});
}

/**
 * Concrete CSS for a preview card, in the theme's own colours.
 *
 * The picker cannot use the `--shadow-*` variables the app runs on: those
 * resolve against whatever theme is *currently applied*, so every swatch would
 * show the shape of the theme you are already using rather than the one you are
 * about to choose. These are computed from the theme being drawn.
 */
export function previewStyle(
  theme: Theme,
  dark: boolean,
): {
  borderRadius: string;
  border: string;
  boxShadow: string;
  fontFamily: string;
} {
  const shape = shapeOf(theme);
  const neutral = dark && theme.darkNeutral ? theme.darkNeutral : theme.neutral;
  const edge = dark ? neutral[700] : neutral[200];
  const shadow =
    shape.elevation === "flat"
      ? "none"
      : shape.elevation === "hard"
        ? `2px 2px 0 0 ${neutral[900]}`
        : shape.elevation === "glow"
          ? `0 0 10px -2px ${theme.accent[500]}`
          : "0 1px 3px 0 rgb(0 0 0 / 0.18)";
  return {
    // 0.5rem is `rounded-lg`, which is what a card uses.
    borderRadius: `calc(0.5rem * ${shape.radius})`,
    border: shape.border === "0px" ? "0" : `${shape.border} solid ${edge}`,
    boxShadow: shadow,
    fontFamily: FONTS[shape.font],
  };
}

const STYLE_ID = "app-palette";
const CSS_CACHE_KEY = "palette.css";

/** `#rrggbb` → `"r g b"`, the form Tailwind's `rgb(var(--x) / <alpha-value>)`
 * needs. Anything unparseable falls back to mid grey rather than breaking the
 * whole sheet: one bad value in an imported file should cost one colour. */
function triple(hex: string): string {
  const m = /^#?([0-9a-f]{6})$/i.exec(hex.trim());
  if (!m) return "128 128 128";
  const n = parseInt(m[1]!, 16);
  return `${(n >> 16) & 0xff} ${(n >> 8) & 0xff} ${n & 0xff}`;
}


const FONTS: Record<Shape["font"], string> = {
  sans: `ui-sans-serif, system-ui, -apple-system, "Segoe UI", Roboto, "Helvetica Neue", Arial, "Noto Sans", sans-serif`,
  serif: `ui-serif, Georgia, Cambria, "Times New Roman", Times, serif`,
  mono: `ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, "Liberation Mono", "Courier New", monospace`,
};

/**
 * The four shadow steps for each elevation.
 *
 * `hard` uses the neutral ramp rather than black so the offset reads as drawn
 * rather than as a smudge, and `glow` uses the accent, which is the only way a
 * shadow can carry a theme's identity at all.
 */
function shadows(elevation: Shape["elevation"]): string {
  switch (elevation) {
    case "flat":
      return [
        "--shadow-sm: none;",
        "--shadow: none;",
        "--shadow-md: none;",
        "--shadow-lg: none;",
      ].join("");
    case "hard":
      return [
        "--shadow-sm: 1px 1px 0 0 rgb(var(--c-n-900) / 0.9);",
        "--shadow: 2px 2px 0 0 rgb(var(--c-n-900) / 0.9);",
        "--shadow-md: 3px 3px 0 0 rgb(var(--c-n-900) / 0.9);",
        "--shadow-lg: 5px 5px 0 0 rgb(var(--c-n-900) / 0.9);",
      ].join("");
    case "glow":
      return [
        "--shadow-sm: 0 0 4px -1px rgb(var(--c-a-500) / 0.5);",
        "--shadow: 0 0 8px -2px rgb(var(--c-a-500) / 0.55);",
        "--shadow-md: 0 0 16px -3px rgb(var(--c-a-500) / 0.6);",
        "--shadow-lg: 0 0 28px -4px rgb(var(--c-a-500) / 0.65);",
      ].join("");
    default:
      return [
        "--shadow-sm: 0 1px 2px 0 rgb(0 0 0 / 0.05);",
        "--shadow: 0 1px 3px 0 rgb(0 0 0 / 0.1), 0 1px 2px -1px rgb(0 0 0 / 0.1);",
        "--shadow-md: 0 4px 6px -1px rgb(0 0 0 / 0.1), 0 2px 4px -2px rgb(0 0 0 / 0.1);",
        "--shadow-lg: 0 10px 15px -3px rgb(0 0 0 / 0.1), 0 4px 6px -4px rgb(0 0 0 / 0.1);",
      ].join("");
  }
}

/** Header and footer surface, which differs between light and dark. */
function chrome(kind: Shape["chrome"], dark: boolean): string {
  switch (kind) {
    case "tinted":
      return dark
        ? "--chrome-bg: rgb(var(--c-a-950));--chrome-border: rgb(var(--c-a-900));--chrome-fg: inherit;--chrome-muted: rgb(var(--c-n-400));"
        : "--chrome-bg: rgb(var(--c-a-50));--chrome-border: rgb(var(--c-a-200));--chrome-fg: inherit;--chrome-muted: rgb(var(--c-n-500));";
    case "solid":
      // The one case that also sets a foreground: on a saturated accent the
      // inherited body colour is unreadable.
      return dark
        ? "--chrome-bg: rgb(var(--c-a-800));--chrome-border: rgb(var(--c-a-700));--chrome-fg: rgb(var(--c-a-50));--chrome-muted: rgb(var(--c-a-200));"
        : "--chrome-bg: rgb(var(--c-a-600));--chrome-border: rgb(var(--c-a-700));--chrome-fg: rgb(var(--c-a-50));--chrome-muted: rgb(var(--c-a-100));";
    case "bare":
      return `--chrome-bg: transparent;--chrome-border: transparent;--chrome-fg: inherit;--chrome-muted: rgb(var(--c-n-${dark ? 400 : 500}));`;
    default:
      return dark
        ? "--chrome-bg: rgb(var(--c-n-900));--chrome-border: rgb(var(--c-n-800));--chrome-fg: inherit;--chrome-muted: rgb(var(--c-n-400));"
        : "--chrome-bg: rgb(var(--c-white));--chrome-border: rgb(var(--c-n-200));--chrome-fg: inherit;--chrome-muted: rgb(var(--c-n-500));";
  }
}

function shapeVars(theme: Theme, dark: boolean): string {
  const shape = ShapeSchema.parse(theme.shape ?? {});
  return (
    `--shape-radius: ${shape.radius};` +
    `--shape-border: ${shape.border};` +
    `--font-body: ${FONTS[shape.font]};` +
    shadows(shape.elevation) +
    chrome(shape.chrome, dark)
  );
}

function vars(theme: Theme, dark: boolean): string {
  const neutral = dark && theme.darkNeutral ? theme.darkNeutral : theme.neutral;
  const lines = [`--c-white: ${triple(theme.white)};`];
  for (const s of STOPS) {
    lines.push(`--c-n-${s}: ${triple(neutral[s])};`);
    lines.push(`--c-a-${s}: ${triple(theme.accent[s])};`);
  }
  return lines.join("") + shapeVars(theme, dark);
}

/**
 * Write the theme as a stylesheet rather than inline styles on <html>.
 *
 * Both rules ship at once, so switching between light and dark is the `.dark`
 * class the app already toggles and needs no JavaScript of its own — which is
 * also what keeps the two in step when the OS theme changes under us.
 */
export function applyTheme(theme: Theme): void {
  // `:root:root` rather than `:root`: the bundled stylesheet (which carries
  // the default palette) is linked *after* this <style> in the built HTML, so
  // at equal specificity the default would win the tie. Doubling the selector
  // makes the theme independent of load order instead of hoping for one.
  // The dark block is always emitted now. It used to be conditional on
  // `darkNeutral`, which was right when a theme was only a palette; the chrome
  // surface differs between light and dark whatever the ramps do.
  const css =
    `:root:root{${vars(theme, false)}}` +
    `:root:root.dark{${vars(theme, true)}}`;
  let el = document.getElementById(STYLE_ID) as HTMLStyleElement | null;
  if (!el) {
    el = document.createElement("style");
    el.id = STYLE_ID;
    document.head.appendChild(el);
  }
  el.textContent = css;
  // Cached so the boot script in index.html can paint the right palette before
  // any of this module loads; otherwise every reload flashes the default one.
  try {
    localStorage.setItem(CSS_CACHE_KEY, css);
  } catch {
    /* private mode: the flash is the only cost */
  }
}

export function customThemes(): Theme[] {
  try {
    const raw = localStorage.getItem(CUSTOM_KEY);
    if (!raw) return [];
    const parsed = z.array(ThemeSchema).safeParse(JSON.parse(raw));
    return parsed.success ? parsed.data : [];
  } catch {
    return [];
  }
}

export function allThemes(): Theme[] {
  // A custom theme reusing a built-in id replaces it, which is how someone
  // tweaks one of the defaults without having to invent a new name for it.
  const custom = customThemes();
  const overridden = new Set(custom.map((t) => t.id));
  return [...BUILTIN_THEMES.filter((t) => !overridden.has(t.id)), ...custom];
}

export function saveCustomThemes(themes: Theme[]): void {
  localStorage.setItem(CUSTOM_KEY, JSON.stringify(themes));
}

export function currentThemeId(): string {
  return localStorage.getItem(STORAGE_KEY) ?? "slate";
}

export function themeById(id: string): Theme {
  return allThemes().find((t) => t.id === id) ?? BUILTIN_THEMES[0]!;
}

export function setThemeId(id: string): void {
  if (id === "slate") localStorage.removeItem(STORAGE_KEY);
  else localStorage.setItem(STORAGE_KEY, id);
  applyTheme(themeById(id));
  window.dispatchEvent(new CustomEvent("palettechange"));
}

/** Re-apply on boot, and whenever an import changes the stored set. */
export function initTheme(): void {
  applyTheme(themeById(currentThemeId()));
}
