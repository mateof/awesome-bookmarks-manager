import { z } from "zod";

const HEX_COLOR = /^#[0-9a-fA-F]{6}$/;

export const TagSchema = z.object({
  id: z.string().uuid(),
  name: z.string(),
  color: z.string().regex(HEX_COLOR),
});
export type Tag = z.infer<typeof TagSchema>;

export const CreateTagBodySchema = z.object({
  name: z.string().min(1).max(64),
  /**
   * Omit it and the server picks one nothing else is using.
   *
   * It used to default to slate grey here, which meant every caller that did
   * not care — the browser extension, the MCP tools, the share importer —
   * produced a wall of identical grey tags. And a client that *did* care had to
   * choose from its own cached list of tags, which is stale the moment two are
   * created in a row: the second one reads a list without the first and picks
   * the same colour again. Only the server knows what is taken.
   */
  color: z.string().regex(HEX_COLOR).optional(),
});
export type CreateTagBody = z.infer<typeof CreateTagBodySchema>;

export const UpdateTagBodySchema = z.object({
  name: z.string().min(1).max(64).optional(),
  color: z.string().regex(HEX_COLOR).optional(),
});
export type UpdateTagBody = z.infer<typeof UpdateTagBodySchema>;

/**
 * Add tags to a batch of folders and bookmarks at once.
 *
 * Adds rather than sets. A multi-selection holds items with different tags
 * already, so "these are now the tags" would silently strip whatever each one
 * had; the only operation that means the same thing for every item in a mixed
 * selection is "also put these on".
 */
export const ApplyTagsBodySchema = z.object({
  folderIds: z.array(z.string().uuid()).max(1000).default([]),
  bookmarkIds: z.array(z.string().uuid()).max(1000).default([]),
  tagIds: z.array(z.string().uuid()).min(1).max(64),
});
export type ApplyTagsBody = z.infer<typeof ApplyTagsBodySchema>;

export const ApplyTagsResultSchema = z.object({
  folders: z.number().int(),
  bookmarks: z.number().int(),
  /** Items the caller may see but not write, named so the UI can say so. */
  skipped: z.number().int(),
});
export type ApplyTagsResult = z.infer<typeof ApplyTagsResultSchema>;

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
export function pickTagColor(existing: { color?: string | null }[]): string {
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
