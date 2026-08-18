import { z } from "zod";

/**
 * Where a user's bytes actually go. The split exists because the answer to
 * "why am I using 4 GB?" is almost always "saved page snapshots", and a single
 * total gives the user nothing to act on.
 */
export const StorageBreakdownSchema = z.object({
  /** Archived page HTML + extracted text. Usually the bulk of it. */
  snapshots: z.number().int(),
  /** Uploaded card/banner background images. */
  images: z.number().int(),
  /** Favicons and uploaded icons. */
  icons: z.number().int(),
  /** Panel backgrounds and tab icons. */
  panelAssets: z.number().int(),
  /**
   * Encrypted rows: titles, URLs, descriptions, version history, panel
   * snapshots and the search index. An estimate — it sums the stored field
   * sizes and ignores SQLite's own per-row and index overhead.
   */
  database: z.number().int(),
});
export type StorageBreakdown = z.infer<typeof StorageBreakdownSchema>;

export const QuotaSourceSchema = z.enum(["user", "default", "none"]);
export type QuotaSource = z.infer<typeof QuotaSourceSchema>;

export const StorageUsageSchema = z.object({
  userId: z.string().uuid(),
  usedBytes: z.number().int(),
  /** null = no limit. */
  quotaBytes: z.number().int().nullable(),
  /** Where the limit comes from: this user's own override, the instance
   *  default, or nowhere (unlimited). */
  quotaSource: QuotaSourceSchema,
  breakdown: StorageBreakdownSchema,
});
export type StorageUsage = z.infer<typeof StorageUsageSchema>;

export const AdminStorageRowSchema = StorageUsageSchema.extend({
  email: z.string(),
  nickname: z.string().nullable(),
  role: z.enum(["user", "admin"]),
});
export type AdminStorageRow = z.infer<typeof AdminStorageRowSchema>;

export const SetUserQuotaBodySchema = z.object({
  /** null clears the per-user override so the instance default applies. */
  quotaBytes: z.number().int().min(0).max(1_000_000_000_000).nullable(),
});
export type SetUserQuotaBody = z.infer<typeof SetUserQuotaBodySchema>;

/** Human-readable byte size, e.g. "1,4 GB". Shared so API and UI agree. */
export function formatBytes(bytes: number, locale?: string): string {
  if (bytes < 1024) return `${bytes} B`;
  const units = ["kB", "MB", "GB", "TB"];
  let value = bytes / 1024;
  let unit = 0;
  while (value >= 1024 && unit < units.length - 1) {
    value /= 1024;
    unit++;
  }
  return `${value.toLocaleString(locale, {
    maximumFractionDigits: value < 10 ? 1 : 0,
  })} ${units[unit]}`;
}
