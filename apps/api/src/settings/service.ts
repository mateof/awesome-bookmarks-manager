import { eq, sql } from "drizzle-orm";
import { getDb } from "../db/client.js";
import { appSettings, users } from "../db/schema.js";

const REGISTRATION_ENABLED = "registration_enabled";

function getSetting(key: string): string | null {
  const row = getDb()
    .select({ value: appSettings.value })
    .from(appSettings)
    .where(eq(appSettings.key, key))
    .get();
  return row?.value ?? null;
}

function setSetting(key: string, value: string) {
  getDb()
    .insert(appSettings)
    .values({ key, value })
    .onConflictDoUpdate({ target: appSettings.key, set: { value } })
    .run();
}

function userCount(): number {
  const row = getDb()
    .select({ n: sql<number>`count(*)` })
    .from(users)
    .get();
  return Number(row?.n ?? 0);
}

/** Stored toggle (defaults to enabled when never set). */
export function getRegistrationEnabled(): boolean {
  const v = getSetting(REGISTRATION_ENABLED);
  if (v === null) return true;
  return v === "true";
}

export function setRegistrationEnabled(enabled: boolean) {
  setSetting(REGISTRATION_ENABLED, enabled ? "true" : "false");
}

/**
 * Whether a public signup is allowed right now. Always open while there are
 * zero users so a fresh instance can bootstrap its first (admin) account,
 * regardless of the stored toggle.
 */
export function isRegistrationOpen(): boolean {
  if (userCount() === 0) return true;
  return getRegistrationEnabled();
}
