import type { Tag } from "@awesome-bookmarks/shared";

/**
 * The colours a tag can be, and which one a new tag gets.
 *
 * Eighteen hues at even spacing plus two neutrals, generated in OKLCH at one
 * lightness and one chroma rather than picked by eye, so no two sit closer
 * together than any other pair and none of them shouts louder than the rest.
 *
 * The lightness band is not a free choice. A chip renders the same hex three
 * ways — as text, as a 20% tint behind that text, and as a 50% border — and the
 * page behind it is white in light mode and near-black in dark. One value has
 * to be legible on both, which puts it in the middle of the range and rules out
 * both pastels and near-blacks. It is the same compromise Tailwind's 500s make.
 */
export const TAG_PALETTE = [
  "#dc5989",
  "#e25a61",
  "#e06131",
  "#ce7300",
  "#b88300",
  "#a18e00",
  "#829a00",
  "#4da537",
  "#00a86e",
  "#00a490",
  "#00a1a8",
  "#009dbf",
  "#0097de",
  "#4b8af3",
  "#7c7df2",
  "#9f71e4",
  "#ba66cd",
  "#ce5eae",
  "#64748b",
  "#78716c",
];

/**
 * The colour a new tag should get: the one that is least used already.
 *
 * Deliberately not random. Random repeats immediately — with twenty colours
 * there is a better than even chance of a collision by the seventh tag — and
 * the whole point of the colour is telling two tags apart at a glance. Going
 * least-used-first means the first twenty tags are all different, and after
 * that it degrades evenly instead of clumping.
 *
 * Ties break by palette order, so the same set of tags always produces the same
 * answer. A colour picked at random is a colour you cannot reason about when
 * somebody asks why two tags look alike.
 */
export function pickTagColor(existing: Pick<Tag, "color">[]): string {
  const used = new Map<string, number>();
  for (const c of TAG_PALETTE) used.set(c, 0);
  for (const tag of existing) {
    const key = tag.color?.toLowerCase();
    if (key && used.has(key)) used.set(key, (used.get(key) ?? 0) + 1);
  }
  let best = TAG_PALETTE[0]!;
  let bestCount = Number.POSITIVE_INFINITY;
  for (const c of TAG_PALETTE) {
    const n = used.get(c) ?? 0;
    if (n < bestCount) {
      best = c;
      bestCount = n;
    }
  }
  return best;
}
