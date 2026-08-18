import { z } from "zod";

/**
 * An active login. One row per browser/device that signed in, so a user can
 * see where their account is open and cut off anything they do not recognise.
 */
export const UserSessionSchema = z.object({
  id: z.string().uuid(),
  /** True for the session making the request; the UI must not offer to kill it silently. */
  current: z.boolean(),
  ip: z.string(),
  /** Raw User-Agent, kept for the cases the parser gets wrong. */
  userAgent: z.string(),
  /** Best-effort readable forms, e.g. "Chrome 126" / "Windows". */
  browser: z.string(),
  os: z.string(),
  device: z.enum(["desktop", "mobile", "tablet", "bot", "unknown"]),
  createdAt: z.string(),
  lastSeenAt: z.string(),
});
export type UserSession = z.infer<typeof UserSessionSchema>;

export const RevokeSessionsResultSchema = z.object({
  revoked: z.number().int(),
});
export type RevokeSessionsResult = z.infer<typeof RevokeSessionsResultSchema>;
