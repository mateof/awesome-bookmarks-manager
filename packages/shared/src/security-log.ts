import { z } from "zod";

/**
 * What gets recorded.
 *
 * Deliberately a closed list rather than "every request". A log nobody can
 * read is not a security tool, and 2xx traffic on a personal bookmark manager
 * is noise that would bury the handful of lines that matter. These are the
 * events you would actually look for after a scare.
 */
export const SecurityEventTypeSchema = z.enum([
  "login_ok",
  "login_failed",
  "login_2fa_required",
  "logout",
  "signup",
  "session_revoked",
  "password_changed",
  "twofa_enabled",
  "twofa_disabled",
  "token_created",
  "token_revoked",
  "panel_view",
  "panel_denied",
  "share_view",
  "share_denied",
  "unauthorized",
  "forbidden",
  "rate_limited",
  "quota_exceeded",
  "admin_action",
  "server_error",
]);
export type SecurityEventType = z.infer<typeof SecurityEventTypeSchema>;

/** Types that indicate someone failing to get in, for the summary counters. */
export const SUSPICIOUS_TYPES: SecurityEventType[] = [
  "login_failed",
  "unauthorized",
  "forbidden",
  "rate_limited",
  "panel_denied",
  "share_denied",
];

export const SecurityEventSchema = z.object({
  id: z.string().uuid(),
  at: z.string(),
  type: SecurityEventTypeSchema,
  /** Null for anonymous traffic and for failed logins of unknown accounts. */
  userId: z.string().nullable(),
  /** Resolved account email when known; for failed logins, what was tried. */
  subject: z.string().nullable(),
  ip: z.string(),
  userAgent: z.string(),
  method: z.string(),
  path: z.string(),
  status: z.number().int().nullable(),
  /** Free-form extra context, e.g. the panel slug. */
  detail: z.string().nullable(),
});
export type SecurityEvent = z.infer<typeof SecurityEventSchema>;

export const SecurityLogQuerySchema = z.object({
  type: z.string().optional(),
  /** Matches the subject (email) or the user id. */
  subject: z.string().max(200).optional(),
  ip: z.string().max(64).optional(),
  /** "4xx" / "5xx" / an exact code. */
  status: z.string().max(8).optional(),
  /** Substring of the path. */
  path: z.string().max(200).optional(),
  since: z.string().max(40).optional(),
  until: z.string().max(40).optional(),
  /** Only the types in SUSPICIOUS_TYPES. */
  suspiciousOnly: z
    .union([z.boolean(), z.enum(["1", "0", "true", "false"])])
    .transform((v) => v === true || v === "1" || v === "true")
    .optional(),
  limit: z.coerce.number().int().min(1).max(500).default(100),
  offset: z.coerce.number().int().min(0).default(0),
});
export type SecurityLogQuery = z.infer<typeof SecurityLogQuerySchema>;

export const SecurityLogPageSchema = z.object({
  events: z.array(SecurityEventSchema),
  total: z.number().int(),
});
export type SecurityLogPage = z.infer<typeof SecurityLogPageSchema>;

export const SecuritySummarySchema = z.object({
  windowHours: z.number().int(),
  total: z.number().int(),
  suspicious: z.number().int(),
  failedLogins: z.number().int(),
  uniqueIps: z.number().int(),
  /** Counts by type, highest first. */
  byType: z.array(z.object({ type: z.string(), count: z.number().int() })),
  /** IPs with the most failed attempts, highest first. */
  topOffenders: z.array(
    z.object({ ip: z.string(), count: z.number().int() }),
  ),
  /** Events per hour across the window, oldest first, for the sparkline. */
  perHour: z.array(z.object({ hour: z.string(), count: z.number().int() })),
});
export type SecuritySummary = z.infer<typeof SecuritySummarySchema>;
