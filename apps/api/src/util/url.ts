import { createHash } from "node:crypto";

/**
 * Normalize a URL for duplicate detection. We don't want trivial differences
 * (trailing slash, default port, casing of host, fragment) to count as
 * different bookmarks.
 */
export function normalizeUrl(raw: string): string {
  const u = new URL(raw);
  u.hash = "";
  u.host = u.host.toLowerCase();
  if (
    (u.protocol === "http:" && u.port === "80") ||
    (u.protocol === "https:" && u.port === "443")
  ) {
    u.port = "";
  }
  if (u.pathname.length > 1 && u.pathname.endsWith("/")) {
    u.pathname = u.pathname.slice(0, -1);
  }
  return u.toString();
}

export function urlHash(raw: string, userId: string): string {
  return createHash("sha256")
    .update(userId)
    .update("|")
    .update(normalizeUrl(raw))
    .digest("hex");
}
