import type { UserSession } from "@awesome-bookmarks/shared";
import { and, desc, eq, isNull, ne } from "drizzle-orm";
import { v4 as uuidv4 } from "uuid";
import { getDb } from "../db/client.js";
import { userSessions } from "../db/schema.js";
import { NotFound } from "../util/errors.js";

/**
 * Active logins.
 *
 * The cookie is encrypted and signed, so it already proves who you are. What
 * it cannot do is stop being valid: until it expires, anyone holding it is you.
 * This table is the missing half — a login gets a row, and revoking the row
 * makes the cookie useless on the very next request.
 */

export function createSession(
  userId: string,
  ip: string,
  userAgent: string,
): string {
  const id = uuidv4();
  getDb()
    .insert(userSessions)
    .values({ id, userId, ip, userAgent: userAgent.slice(0, 512) })
    .run();
  return id;
}

/** True when the session exists, belongs to the user and is not revoked. */
export function isSessionAlive(id: string, userId: string): boolean {
  const row = getDb()
    .select({ id: userSessions.id })
    .from(userSessions)
    .where(
      and(
        eq(userSessions.id, id),
        eq(userSessions.userId, userId),
        isNull(userSessions.revokedAt),
      ),
    )
    .get();
  return !!row;
}

// Every request would otherwise write a row. A minute of resolution is plenty
// for "last seen" and keeps reads from turning into writes.
const TOUCH_INTERVAL_MS = 60_000;
const lastTouch = new Map<string, number>();

export function touchSession(id: string) {
  const now = Date.now();
  const previous = lastTouch.get(id) ?? 0;
  if (now - previous < TOUCH_INTERVAL_MS) return;
  lastTouch.set(id, now);
  getDb()
    .update(userSessions)
    .set({ lastSeenAt: new Date().toISOString() })
    .where(eq(userSessions.id, id))
    .run();
}

export function listSessions(userId: string, currentId?: string): UserSession[] {
  const rows = getDb()
    .select()
    .from(userSessions)
    .where(and(eq(userSessions.userId, userId), isNull(userSessions.revokedAt)))
    .orderBy(desc(userSessions.lastSeenAt))
    .all();
  return rows.map((r) => {
    const parsed = describeUserAgent(r.userAgent);
    return {
      id: r.id,
      current: r.id === currentId,
      ip: r.ip,
      userAgent: r.userAgent,
      browser: parsed.browser,
      os: parsed.os,
      device: parsed.device,
      createdAt: r.createdAt,
      lastSeenAt: r.lastSeenAt,
    };
  });
}

export function revokeSession(userId: string, id: string) {
  const row = getDb()
    .select({ id: userSessions.id })
    .from(userSessions)
    .where(and(eq(userSessions.id, id), eq(userSessions.userId, userId)))
    .get();
  if (!row) throw NotFound("Session not found");
  getDb()
    .update(userSessions)
    .set({ revokedAt: new Date().toISOString() })
    .where(eq(userSessions.id, id))
    .run();
  lastTouch.delete(id);
}

/** Revoke everything except the caller's own session. */
export function revokeOtherSessions(userId: string, keepId: string): number {
  const res = getDb()
    .update(userSessions)
    .set({ revokedAt: new Date().toISOString() })
    .where(
      and(
        eq(userSessions.userId, userId),
        ne(userSessions.id, keepId),
        isNull(userSessions.revokedAt),
      ),
    )
    .run();
  return Number(res.changes ?? 0);
}

/**
 * A readable description of a User-Agent.
 *
 * Hand-rolled rather than pulled from a library: the goal is "do I recognise
 * this?", which needs the browser, the platform and the form factor, not an
 * exhaustive device database. The raw string travels alongside it for the
 * cases this gets wrong.
 */
export function describeUserAgent(ua: string): {
  browser: string;
  os: string;
  device: UserSession["device"];
} {
  if (!ua.trim()) return { browser: "?", os: "?", device: "unknown" };

  const version = (re: RegExp): string => {
    const m = re.exec(ua);
    return m?.[1] ? ` ${m[1].split(".")[0]}` : "";
  };

  let browser = "?";
  // Order matters: nearly every browser claims to be Safari and Chrome too,
  // so the most specific token has to win.
  if (/\bEdg\//.test(ua)) browser = `Edge${version(/\bEdg\/([\d.]+)/)}`;
  else if (/\bOPR\/|\bOpera\//.test(ua)) browser = `Opera${version(/\bOPR\/([\d.]+)/)}`;
  else if (/\bVivaldi\//.test(ua)) browser = `Vivaldi${version(/\bVivaldi\/([\d.]+)/)}`;
  else if (/\bFirefox\//.test(ua)) browser = `Firefox${version(/\bFirefox\/([\d.]+)/)}`;
  else if (/\bChrome\//.test(ua)) browser = `Chrome${version(/\bChrome\/([\d.]+)/)}`;
  else if (/\bSafari\//.test(ua)) browser = `Safari${version(/\bVersion\/([\d.]+)/)}`;
  else if (/curl\//i.test(ua)) browser = "curl";
  else if (/bot|crawler|spider/i.test(ua)) browser = "bot";

  let os = "?";
  if (/Windows NT 10/.test(ua)) os = "Windows 10/11";
  else if (/Windows/.test(ua)) os = "Windows";
  else if (/Android/.test(ua)) os = `Android${version(/Android ([\d.]+)/)}`;
  else if (/iPhone|iPad|iPod/.test(ua)) os = `iOS${version(/OS (\d+)/)}`;
  else if (/Mac OS X/.test(ua)) os = "macOS";
  else if (/CrOS/.test(ua)) os = "ChromeOS";
  else if (/Linux/.test(ua)) os = "Linux";

  let device: UserSession["device"] = "desktop";
  if (/bot|crawler|spider/i.test(ua)) device = "bot";
  else if (/iPad|Tablet/.test(ua)) device = "tablet";
  else if (/Mobi|Android|iPhone/.test(ua)) device = "mobile";
  else if (os === "?" && browser === "?") device = "unknown";

  return { browser, os, device };
}
