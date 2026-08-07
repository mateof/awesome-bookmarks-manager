import { getEnv } from "../env.js";

export interface WebAuthnConfig {
  rpID: string;
  rpName: string;
  origins: string[];
}

/**
 * Passkeys are opt-in: they only work when the app is served from a real
 * domain over HTTPS (WebAuthn forbids IP-address RP IDs), so the operator must
 * set WEBAUTHN_RP_ID and WEBAUTHN_ORIGIN. Returns null when not configured, in
 * which case the routes 404 and the UI hides the feature.
 */
export function webauthnConfig(): WebAuthnConfig | null {
  const env = getEnv();
  const rpID = env.WEBAUTHN_RP_ID?.trim();
  const originRaw = env.WEBAUTHN_ORIGIN?.trim();
  if (!rpID || !originRaw) return null;
  const origins = originRaw
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean);
  if (origins.length === 0) return null;
  return { rpID, rpName: env.WEBAUTHN_RP_NAME, origins };
}
