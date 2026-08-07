import { eq, sql } from "drizzle-orm";
import { getDb } from "../db/client.js";
import { appSettings, users } from "../db/schema.js";

const REGISTRATION_ENABLED = "registration_enabled";
const REQUIRE_2FA = "require_2fa";
const TRUSTED_NETWORKS = "trusted_networks";
const SKIP_2FA_ON_TRUSTED = "skip_2fa_on_trusted";

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

/** When on, every user must have TOTP 2FA enabled to use the app. */
export function getRequire2fa(): boolean {
  return getSetting(REQUIRE_2FA) === "true";
}
export function setRequire2fa(enabled: boolean) {
  setSetting(REQUIRE_2FA, enabled ? "true" : "false");
}

/** Admin-configured trusted CIDRs (IPv4), e.g. "192.168.0.0/16,10.0.0.0/8". */
export function getTrustedNetworks(): string[] {
  const v = getSetting(TRUSTED_NETWORKS);
  if (!v) return [];
  return v
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean);
}
export function setTrustedNetworks(cidrs: string[]) {
  setSetting(
    TRUSTED_NETWORKS,
    cidrs.map((s) => s.trim()).filter(Boolean).join(","),
  );
}

/** When on, requests from a trusted network are not asked for the 2nd factor. */
export function getSkip2faOnTrusted(): boolean {
  return getSetting(SKIP_2FA_ON_TRUSTED) === "true";
}
export function setSkip2faOnTrusted(enabled: boolean) {
  setSetting(SKIP_2FA_ON_TRUSTED, enabled ? "true" : "false");
}
