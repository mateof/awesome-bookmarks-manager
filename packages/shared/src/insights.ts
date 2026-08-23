import { z } from "zod";
import { QuotaSourceSchema, StorageBreakdownSchema } from "./storage.js";

/**
 * The admin panel: how much everyone is storing, and how the instance is used.
 *
 * **Everything here is metadata, and it has to be.** An admin holds nobody's
 * key, so there is no folder name, bookmark title or description anywhere in
 * this file, and there cannot be — the server would need a user's password-
 * derived key to read those, and it does not have it. What is left is counts,
 * bytes and timestamps, which need no decryption because they were never
 * encrypted.
 *
 * That is a deliberate limit rather than an oversight, and the panel says so on
 * screen: an admin who thinks the page is broken because it will not show them
 * what somebody bookmarked is worse off than one who knows why.
 */

/** Counts of a user's things. All from `count(*)`, none from plaintext. */
export const InsightsCountsSchema = z.object({
  bookmarks: z.number().int(),
  folders: z.number().int(),
  tags: z.number().int(),
  attachments: z.number().int(),
  databases: z.number().int(),
  panels: z.number().int(),
  smartFolders: z.number().int(),
  /** Bookmarks with a captured page. The expensive ones, in disk terms. */
  snapshots: z.number().int(),
  /** Soft-deleted rows still taking space, which is worth seeing separately. */
  trashed: z.number().int(),
});
export type InsightsCounts = z.infer<typeof InsightsCountsSchema>;

export const InsightsUserSchema = z.object({
  userId: z.string().uuid(),
  email: z.string(),
  nickname: z.string().nullable(),
  role: z.enum(["user", "admin"]),
  createdAt: z.string(),
  /** Most recent activity on any session, revoked ones included. */
  lastSeenAt: z.string().nullable(),
  /** Sessions not revoked and not expired: roughly "logged-in devices". */
  activeSessions: z.number().int(),
  twoFactorEnabled: z.boolean(),
  usedBytes: z.number().int(),
  quotaBytes: z.number().int().nullable(),
  quotaSource: QuotaSourceSchema,
  breakdown: StorageBreakdownSchema,
  counts: InsightsCountsSchema,
});
export type InsightsUser = z.infer<typeof InsightsUserSchema>;

/** One day of the activity strip. */
export const InsightsDaySchema = z.object({
  /** `YYYY-MM-DD`, UTC, so it lines up with how timestamps are stored. */
  date: z.string(),
  logins: z.number().int(),
  failedLogins: z.number().int(),
});
export type InsightsDay = z.infer<typeof InsightsDaySchema>;

export const InsightsInstanceSchema = z.object({
  users: z.number().int(),
  admins: z.number().int(),
  /** Seen within the last day / week / month. */
  activeDay: z.number().int(),
  activeWeek: z.number().int(),
  activeMonth: z.number().int(),
  newUsersMonth: z.number().int(),
  /** Accounts that have never had a session at all. */
  neverSignedIn: z.number().int(),
  counts: InsightsCountsSchema,
  groups: z.number().int(),
  shares: z.number().int(),
  publicLinks: z.number().int(),
  storageBytes: z.number().int(),
  breakdown: StorageBreakdownSchema,
  jobs: z.object({
    pending: z.number().int(),
    running: z.number().int(),
    error: z.number().int(),
    done: z.number().int(),
  }),
  /** Oldest first, one entry per day for the last 30. */
  activity: z.array(InsightsDaySchema),
});
export type InsightsInstance = z.infer<typeof InsightsInstanceSchema>;

export const AdminInsightsSchema = z.object({
  instance: InsightsInstanceSchema,
  users: z.array(InsightsUserSchema),
  /** When the server built this, so the page can say how fresh it is. */
  generatedAt: z.string(),
});
export type AdminInsights = z.infer<typeof AdminInsightsSchema>;
