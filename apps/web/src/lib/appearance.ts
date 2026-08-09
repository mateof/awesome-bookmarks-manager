/**
 * Client-side generators for the built-in appearance library: 20 default
 * background images and a helper that composes a picked glyph onto a coloured
 * tile. Everything is produced as a self-contained SVG string and uploaded
 * through the normal (encrypted) icon/background pipeline, so there are no
 * bundled asset files and no schema changes.
 */

const BG_W = 1200;
const BG_H = 400;

function svgDoc(inner: string, w = BG_W, h = BG_H): string {
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${w} ${h}" preserveAspectRatio="xMidYMid slice">${inner}</svg>`;
}

/** SVG string -> uploadable File (kept as SVG: tiny and crisp at any size). */
export function svgFile(svg: string, name: string): File {
  return new File([svg], name, { type: "image/svg+xml" });
}

/** data: URL for previewing an SVG in an <img> without a network round-trip. */
export function svgDataUrl(svg: string): string {
  return `data:image/svg+xml;utf8,${encodeURIComponent(svg)}`;
}

// --- Background builders ---------------------------------------------------

type Pair = [string, string];

const PALETTES: Pair[] = [
  ["#6366f1", "#8b5cf6"],
  ["#06b6d4", "#3b82f6"],
  ["#f59e0b", "#ef4444"],
  ["#10b981", "#06b6d4"],
  ["#ec4899", "#8b5cf6"],
  ["#f97316", "#eab308"],
  ["#14b8a6", "#6366f1"],
  ["#ef4444", "#ec4899"],
  ["#0ea5e9", "#22c55e"],
  ["#a855f7", "#ec4899"],
  ["#334155", "#0f172a"],
  ["#f43f5e", "#f97316"],
];

function linear([a, b]: Pair, angle: number): string {
  const rad = (angle * Math.PI) / 180;
  const x = Math.cos(rad);
  const y = Math.sin(rad);
  const x1 = (0.5 - x / 2).toFixed(3);
  const y1 = (0.5 - y / 2).toFixed(3);
  const x2 = (0.5 + x / 2).toFixed(3);
  const y2 = (0.5 + y / 2).toFixed(3);
  return svgDoc(
    `<defs><linearGradient id="g" x1="${x1}" y1="${y1}" x2="${x2}" y2="${y2}"><stop offset="0" stop-color="${a}"/><stop offset="1" stop-color="${b}"/></linearGradient></defs><rect width="${BG_W}" height="${BG_H}" fill="url(#g)"/>`,
  );
}

function radial([a, b]: Pair): string {
  return svgDoc(
    `<defs><radialGradient id="g" cx="0.3" cy="0.25" r="0.9"><stop offset="0" stop-color="${a}"/><stop offset="1" stop-color="${b}"/></radialGradient></defs><rect width="${BG_W}" height="${BG_H}" fill="url(#g)"/>`,
  );
}

function dots([a, b]: Pair): string {
  return svgDoc(
    `<defs><linearGradient id="g" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="${a}"/><stop offset="1" stop-color="${b}"/></linearGradient><pattern id="p" width="40" height="40" patternUnits="userSpaceOnUse"><circle cx="8" cy="8" r="3" fill="#ffffff" fill-opacity="0.18"/></pattern></defs><rect width="${BG_W}" height="${BG_H}" fill="url(#g)"/><rect width="${BG_W}" height="${BG_H}" fill="url(#p)"/>`,
  );
}

function stripes([a, b]: Pair): string {
  return svgDoc(
    `<defs><linearGradient id="g" x1="0" y1="0" x2="1" y2="0"><stop offset="0" stop-color="${a}"/><stop offset="1" stop-color="${b}"/></linearGradient><pattern id="p" width="28" height="28" patternUnits="userSpaceOnUse" patternTransform="rotate(45)"><rect width="14" height="28" fill="#ffffff" fill-opacity="0.08"/></pattern></defs><rect width="${BG_W}" height="${BG_H}" fill="url(#g)"/><rect width="${BG_W}" height="${BG_H}" fill="url(#p)"/>`,
  );
}

function waves([a, b]: Pair): string {
  return svgDoc(
    `<defs><linearGradient id="g" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="${a}"/><stop offset="1" stop-color="${b}"/></linearGradient></defs><rect width="${BG_W}" height="${BG_H}" fill="url(#g)"/><path d="M0 300 C 200 240, 400 360, 600 300 S 1000 240, 1200 300 V400 H0 Z" fill="#ffffff" fill-opacity="0.10"/><path d="M0 340 C 250 290, 450 390, 700 340 S 1050 300, 1200 350 V400 H0 Z" fill="#ffffff" fill-opacity="0.08"/>`,
  );
}

function mesh(a: string, b: string, c: string): string {
  return svgDoc(
    `<rect width="${BG_W}" height="${BG_H}" fill="${a}"/><defs><radialGradient id="r1" cx="0.2" cy="0.3" r="0.5"><stop offset="0" stop-color="${b}" stop-opacity="0.9"/><stop offset="1" stop-color="${b}" stop-opacity="0"/></radialGradient><radialGradient id="r2" cx="0.8" cy="0.7" r="0.6"><stop offset="0" stop-color="${c}" stop-opacity="0.9"/><stop offset="1" stop-color="${c}" stop-opacity="0"/></radialGradient></defs><rect width="${BG_W}" height="${BG_H}" fill="url(#r1)"/><rect width="${BG_W}" height="${BG_H}" fill="url(#r2)"/>`,
  );
}

export interface DefaultBackground {
  id: string;
  svg: string;
}

function buildBackgrounds(): DefaultBackground[] {
  const out: DefaultBackground[] = [];
  const push = (id: string, svg: string) => out.push({ id, svg });
  // 8 gradients at varied angles
  push("grad-1", linear(PALETTES[0]!, 20));
  push("grad-2", linear(PALETTES[1]!, 135));
  push("grad-3", linear(PALETTES[2]!, 70));
  push("grad-4", linear(PALETTES[3]!, 200));
  push("grad-5", linear(PALETTES[4]!, 315));
  push("grad-6", linear(PALETTES[8]!, 100));
  push("grad-7", linear(PALETTES[9]!, 45));
  push("grad-8", linear(PALETTES[11]!, 160));
  // 3 radial
  push("radial-1", radial(PALETTES[6]!));
  push("radial-2", radial(PALETTES[10]!));
  push("radial-3", radial(PALETTES[7]!));
  // 3 dotted
  push("dots-1", dots(PALETTES[1]!));
  push("dots-2", dots(PALETTES[4]!));
  push("dots-3", dots(PALETTES[3]!));
  // 2 striped
  push("stripes-1", stripes(PALETTES[0]!));
  push("stripes-2", stripes(PALETTES[5]!));
  // 2 waves
  push("waves-1", waves(PALETTES[8]!));
  push("waves-2", waves(PALETTES[6]!));
  // 2 mesh
  push("mesh-1", mesh("#0f172a", "#6366f1", "#ec4899"));
  push("mesh-2", mesh("#111827", "#06b6d4", "#22c55e"));
  return out;
}

export const DEFAULT_BACKGROUNDS: DefaultBackground[] = buildBackgrounds();

// --- Icon tile composition -------------------------------------------------

/** Tile colours offered for composed icons (matches the bg palette family). */
export const ICON_TILE_COLORS: string[] = [
  "#6366f1",
  "#3b82f6",
  "#06b6d4",
  "#10b981",
  "#22c55e",
  "#eab308",
  "#f97316",
  "#ef4444",
  "#ec4899",
  "#a855f7",
  "#64748b",
  "#0f172a",
];

/**
 * Compose the inner markup of a lucide glyph (24x24 viewBox, stroke-based)
 * onto a rounded coloured tile, returning a standalone 128x128 SVG string.
 * The glyph is scaled 3x and centred; stroke is white for contrast.
 */
export function composeIconSvg(glyphInner: string, tileColor: string): string {
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 128 128"><rect width="128" height="128" rx="28" fill="${tileColor}"/><g transform="translate(28 28) scale(3.17)" fill="none" stroke="#ffffff" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">${glyphInner}</g></svg>`;
}
