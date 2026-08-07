import type { MeResponse } from "@awesome-bookmarks/shared";
import { api } from "./api.js";

/**
 * Native WebAuthn + PRF helpers. We call navigator.credentials directly (not
 * @simplewebauthn/browser) because that library does not pass through the PRF
 * extension, and PRF is how a passkey derives the secret that unwraps the DEK.
 * @simplewebauthn/server still verifies the ceremony server-side.
 *
 * A fixed salt keeps the PRF output stable per credential across register and
 * login, so we never need to store a per-credential salt.
 */
const PRF_SALT = new TextEncoder().encode("awesome-bookmarks-prf-v1");

function b64urlToBuf(s: string): ArrayBuffer {
  const pad = s.length % 4 === 0 ? "" : "=".repeat(4 - (s.length % 4));
  const bin = atob(s.replace(/-/g, "+").replace(/_/g, "/") + pad);
  const bytes = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
  return bytes.buffer;
}

function bufToB64url(buf: ArrayBuffer): string {
  const bytes = new Uint8Array(buf);
  let bin = "";
  for (const b of bytes) bin += String.fromCharCode(b);
  return btoa(bin).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

export function passkeysSupported(): boolean {
  return (
    typeof window !== "undefined" &&
    !!window.PublicKeyCredential &&
    !!navigator.credentials
  );
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type AnyOptions = any;

function readPrf(cred: PublicKeyCredential): ArrayBuffer | null {
  const ext = cred.getClientExtensionResults() as AnyOptions;
  const first = ext?.prf?.results?.first;
  if (!first) return null;
  return first instanceof ArrayBuffer ? first : new Uint8Array(first).buffer;
}

/** Register a new passkey for the currently logged-in user. */
export async function registerPasskey(label: string): Promise<void> {
  const options = (await api.webauthnRegisterOptions()) as AnyOptions;
  const publicKey: AnyOptions = {
    ...options,
    challenge: b64urlToBuf(options.challenge),
    user: { ...options.user, id: b64urlToBuf(options.user.id) },
    excludeCredentials: (options.excludeCredentials ?? []).map(
      (c: AnyOptions) => ({ ...c, id: b64urlToBuf(c.id) }),
    ),
    extensions: { prf: { eval: { first: PRF_SALT } } },
  };
  const cred = (await navigator.credentials.create({
    publicKey,
  })) as PublicKeyCredential | null;
  if (!cred) throw new Error("No se creó la passkey");

  let prf = readPrf(cred);
  if (!prf) {
    // Some authenticators only return the PRF output on an assertion; do one
    // right after creating so we can wrap the DEK.
    prf = await evaluatePrf(cred.rawId, options.rp?.id);
  }
  if (!prf) throw new Error("Este autenticador no soporta PRF");

  const att = cred.response as AuthenticatorAttestationResponse;
  await api.webauthnRegisterVerify({
    response: {
      id: cred.id,
      rawId: cred.id,
      response: {
        clientDataJSON: bufToB64url(att.clientDataJSON),
        attestationObject: bufToB64url(att.attestationObject),
        transports: att.getTransports ? att.getTransports() : [],
      },
      authenticatorAttachment: cred.authenticatorAttachment ?? undefined,
      clientExtensionResults: {},
      type: "public-key",
    },
    prfSecret: bufToB64url(prf),
    label,
  });
}

/** A standalone assertion used only to obtain the PRF output at register time. */
async function evaluatePrf(
  rawId: ArrayBuffer,
  rpId: string | undefined,
): Promise<ArrayBuffer | null> {
  const challenge = new Uint8Array(32);
  crypto.getRandomValues(challenge);
  const publicKey: AnyOptions = {
    challenge: challenge.buffer,
    rpId,
    allowCredentials: [{ id: rawId, type: "public-key" }],
    userVerification: "preferred",
    extensions: { prf: { eval: { first: PRF_SALT } } },
  };
  const assertion = (await navigator.credentials.get({
    publicKey,
  })) as PublicKeyCredential | null;
  return assertion ? readPrf(assertion) : null;
}

/** Log in with a passkey. Returns the user on success. */
export async function loginWithPasskey(): Promise<MeResponse> {
  const options = (await api.webauthnLoginOptions()) as AnyOptions;
  const publicKey: AnyOptions = {
    ...options,
    challenge: b64urlToBuf(options.challenge),
    allowCredentials: (options.allowCredentials ?? []).map((c: AnyOptions) => ({
      ...c,
      id: b64urlToBuf(c.id),
    })),
    extensions: { prf: { eval: { first: PRF_SALT } } },
  };
  const cred = (await navigator.credentials.get({
    publicKey,
  })) as PublicKeyCredential | null;
  if (!cred) throw new Error("No se obtuvo la passkey");
  const prf = readPrf(cred);
  if (!prf) throw new Error("Este autenticador no soporta PRF");

  const asr = cred.response as AuthenticatorAssertionResponse;
  return api.webauthnLoginVerify({
    response: {
      id: cred.id,
      rawId: cred.id,
      response: {
        clientDataJSON: bufToB64url(asr.clientDataJSON),
        authenticatorData: bufToB64url(asr.authenticatorData),
        signature: bufToB64url(asr.signature),
        userHandle: asr.userHandle ? bufToB64url(asr.userHandle) : undefined,
      },
      authenticatorAttachment: cred.authenticatorAttachment ?? undefined,
      clientExtensionResults: {},
      type: "public-key",
    },
    prfSecret: bufToB64url(prf),
  });
}
