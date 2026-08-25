/**
 * Choosing a colour for something new: a tag, an option in a select column.
 *
 * The rule is **at random among the least used**, which is two rules doing two
 * different jobs.
 *
 * Random, because walking the palette in order makes the first thing you
 * create always red and the second always orange. That is not a colour, it is
 * a counter with a paint job: it says nothing about the thing it is on, and it
 * reads as broken the moment you notice the pattern.
 *
 * Least used first, because uniform random over the whole palette is worse
 * than it sounds. With twenty colours the chance of two matching is already
 * better than even by the seventh — the birthday problem — and two tags the
 * same colour is the single outcome the colour exists to prevent. Restricting
 * the draw to the colours nothing is using keeps the first twenty all
 * different, and after that it spreads evenly instead of clumping.
 *
 * So: unpredictable, and never a repeat while a fresh colour is left.
 */
export function pickColor(
  palette: readonly string[],
  existing: { color?: string | null }[],
): string {
  const used = new Map<string, number>();
  for (const c of palette) used.set(c.toLowerCase(), 0);
  for (const item of existing) {
    const key = item.color?.toLowerCase();
    if (key && used.has(key)) used.set(key, (used.get(key) ?? 0) + 1);
  }

  let fewest = Number.POSITIVE_INFINITY;
  for (const n of used.values()) fewest = Math.min(fewest, n);
  const candidates = palette.filter(
    (c) => (used.get(c.toLowerCase()) ?? 0) === fewest,
  );

  return (
    candidates[Math.floor(Math.random() * candidates.length)] ??
    palette[0] ??
    "#64748b"
  );
}
