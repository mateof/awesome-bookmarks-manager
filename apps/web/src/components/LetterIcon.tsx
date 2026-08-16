/**
 * Fallback bookmark icon: the first letter on a coloured tile, the same idea
 * the public panels use when a site has no favicon.
 *
 * The colour is derived from a stable seed (the URL) rather than picked at
 * random, so the same bookmark always looks the same across reloads, devices
 * and list re-orders. A palette of readable, saturated hues is used instead of
 * a raw hash-to-hex so the tiles stay legible with white text.
 */

const PALETTE = [
  "#2563eb",
  "#7c3aed",
  "#db2777",
  "#dc2626",
  "#ea580c",
  "#ca8a04",
  "#16a34a",
  "#0d9488",
  "#0284c7",
  "#4f46e5",
  "#9333ea",
  "#be123c",
];

/** Stable 32-bit hash (FNV-1a) so the colour never shifts between sessions. */
function hash(seed: string): number {
  let h = 0x811c9dc5;
  for (let i = 0; i < seed.length; i++) {
    h ^= seed.charCodeAt(i);
    h = Math.imul(h, 0x01000193);
  }
  return h >>> 0;
}

/** First meaningful character of a title or hostname. */
function initial(label: string): string {
  const cleaned = label.trim().replace(/^https?:\/\//, "").replace(/^www\./, "");
  const ch = [...cleaned][0] ?? "?";
  return ch.toUpperCase();
}

export function LetterIcon({
  label,
  seed,
  size,
}: {
  label: string;
  /** Stable colour seed; falls back to the label when absent. */
  seed?: string;
  /** Tailwind size classes, e.g. "h-8 w-8". */
  size: string;
}) {
  const color = PALETTE[hash(seed || label) % PALETTE.length];
  return (
    <span
      aria-hidden
      className={`${size} shrink-0 select-none rounded font-bold text-white`}
      style={{
        background: color,
        display: "inline-flex",
        alignItems: "center",
        justifyContent: "center",
        // Scale the glyph with the tile instead of hard-coding a font size.
        fontSize: "0.5em",
        lineHeight: 1,
        containerType: "inline-size",
      }}
    >
      <span style={{ fontSize: "min(60cqw, 60cqh)" }}>{initial(label)}</span>
    </span>
  );
}
