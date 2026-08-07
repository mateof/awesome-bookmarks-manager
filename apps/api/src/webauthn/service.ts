import { aeadDecrypt, aeadEncrypt, hkdf } from "@awesome-bookmarks/crypto";
import {
  generateAuthenticationOptions,
  generateRegistrationOptions,
  verifyAuthenticationResponse,
  verifyRegistrationResponse,
} from "@simplewebauthn/server";
import type {
  AuthenticationExtensionsClientInputs,
  AuthenticationResponseJSON,
  AuthenticatorTransportFuture,
  RegistrationResponseJSON,
} from "@simplewebauthn/server";
import { eq } from "drizzle-orm";
import { v4 as uuidv4 } from "uuid";
import { masterUnwrap, masterWrap } from "../auth/encryption.js";
import type { AuthedContext } from "../auth/session.js";
import { getDb } from "../db/client.js";
import { users, webauthnCredentials } from "../db/schema.js";
import { BadRequest, NotFound, Unauthorized } from "../util/errors.js";
import { type WebAuthnConfig, webauthnConfig } from "./config.js";

function cfg(): WebAuthnConfig {
  const c = webauthnConfig();
  if (!c) throw NotFound("Passkeys not enabled");
  return c;
}

// The DEK is sealed twice: with a key derived from the credential's PRF output
// (so only the passkey can produce it) and then with the master key (so a bare
// DB leak is not enough). Mirrors the API-token envelope model.
function prfKey(prfSecret: Buffer): Buffer {
  return hkdf(
    prfSecret,
    Buffer.from("awesome-bookmarks/webauthn"),
    "webauthn-dek",
    32,
  );
}
function sealDek(userId: string, credentialId: string, dek: Buffer, prf: Buffer) {
  const inner = aeadEncrypt(prfKey(prf), dek, `webauthn|${credentialId}`);
  return masterWrap(userId, inner);
}
function openDek(
  userId: string,
  credentialId: string,
  envelope: Buffer,
  prf: Buffer,
) {
  const inner = masterUnwrap(userId, envelope);
  return aeadDecrypt(prfKey(prf), inner, `webauthn|${credentialId}`);
}

const csv = (s: string | null): AuthenticatorTransportFuture[] | undefined =>
  s ? (s.split(",") as AuthenticatorTransportFuture[]) : undefined;

// prf: {} asks the authenticator to enable PRF; the browser evaluates the
// salt and sends us the resulting secret. The type lags the spec, hence cast.
const PRF_EXT = {
  prf: {},
} as unknown as AuthenticationExtensionsClientInputs;

export async function genRegistrationOptions(ctx: AuthedContext) {
  const c = cfg();
  const user = getDb()
    .select({ email: users.email, nickname: users.nickname })
    .from(users)
    .where(eq(users.id, ctx.userId))
    .get();
  if (!user) throw NotFound("User not found");
  const existing = getDb()
    .select({
      credentialId: webauthnCredentials.credentialId,
      transports: webauthnCredentials.transports,
    })
    .from(webauthnCredentials)
    .where(eq(webauthnCredentials.userId, ctx.userId))
    .all();
  return generateRegistrationOptions({
    rpName: c.rpName,
    rpID: c.rpID,
    userName: user.nickname || user.email,
    userID: new TextEncoder().encode(ctx.userId),
    attestationType: "none",
    excludeCredentials: existing.map((e) => ({
      id: e.credentialId,
      transports: csv(e.transports),
    })),
    authenticatorSelection: {
      residentKey: "required",
      userVerification: "preferred",
    },
    extensions: PRF_EXT,
  });
}

export async function verifyRegistration(
  ctx: AuthedContext,
  input: {
    response: RegistrationResponseJSON;
    prfSecret: string;
    label?: string;
    expectedChallenge?: string;
  },
) {
  const c = cfg();
  if (!input.expectedChallenge) throw BadRequest("No hay reto de registro activo");
  const verification = await verifyRegistrationResponse({
    response: input.response,
    expectedChallenge: input.expectedChallenge,
    expectedOrigin: c.origins,
    expectedRPID: c.rpID,
    requireUserVerification: false,
  });
  if (!verification.verified || !verification.registrationInfo) {
    throw BadRequest("No se pudo verificar la passkey");
  }
  const prf = Buffer.from(input.prfSecret, "base64url");
  if (prf.length < 16) {
    throw BadRequest("Este autenticador no soporta PRF (necesario para passkeys)");
  }
  const { credential } = verification.registrationInfo;
  const dekWrap = sealDek(ctx.userId, credential.id, ctx.dek, prf);
  getDb()
    .insert(webauthnCredentials)
    .values({
      id: uuidv4(),
      userId: ctx.userId,
      credentialId: credential.id,
      publicKey: Buffer.from(credential.publicKey),
      counter: credential.counter,
      transports: credential.transports?.join(",") ?? null,
      dekWrap,
      label: input.label?.trim().slice(0, 64) || "Passkey",
    })
    .run();
  return { ok: true as const };
}

export async function genAuthenticationOptions() {
  const c = cfg();
  // No allowCredentials: rely on discoverable (resident) credentials so the
  // user doesn't need to type a username first.
  return generateAuthenticationOptions({
    rpID: c.rpID,
    userVerification: "preferred",
    extensions: PRF_EXT,
  });
}

export async function verifyAuthentication(input: {
  response: AuthenticationResponseJSON;
  prfSecret: string;
  expectedChallenge?: string;
}): Promise<{ userId: string; dek: Buffer }> {
  const c = cfg();
  if (!input.expectedChallenge) throw Unauthorized("No hay reto de login activo");
  const row = getDb()
    .select()
    .from(webauthnCredentials)
    .where(eq(webauthnCredentials.credentialId, input.response.id))
    .get();
  if (!row) throw Unauthorized("Passkey desconocida");
  const verification = await verifyAuthenticationResponse({
    response: input.response,
    expectedChallenge: input.expectedChallenge,
    expectedOrigin: c.origins,
    expectedRPID: c.rpID,
    requireUserVerification: false,
    credential: {
      id: row.credentialId,
      publicKey: new Uint8Array(row.publicKey),
      counter: row.counter,
      transports: csv(row.transports),
    },
  });
  if (!verification.verified) throw Unauthorized("No se pudo verificar la passkey");
  getDb()
    .update(webauthnCredentials)
    .set({
      counter: verification.authenticationInfo.newCounter,
      lastUsedAt: new Date().toISOString(),
    })
    .where(eq(webauthnCredentials.id, row.id))
    .run();
  const prf = Buffer.from(input.prfSecret, "base64url");
  if (prf.length < 16) throw Unauthorized("Falta el secreto PRF de la passkey");
  const dek = openDek(row.userId, row.credentialId, Buffer.from(row.dekWrap), prf);
  return { userId: row.userId, dek };
}

export function listCredentials(userId: string) {
  return getDb()
    .select({
      id: webauthnCredentials.id,
      label: webauthnCredentials.label,
      createdAt: webauthnCredentials.createdAt,
      lastUsedAt: webauthnCredentials.lastUsedAt,
    })
    .from(webauthnCredentials)
    .where(eq(webauthnCredentials.userId, userId))
    .all();
}

export function deleteCredential(ctx: AuthedContext, id: string) {
  const row = getDb()
    .select({ userId: webauthnCredentials.userId })
    .from(webauthnCredentials)
    .where(eq(webauthnCredentials.id, id))
    .get();
  if (!row || row.userId !== ctx.userId) throw NotFound("Passkey not found");
  getDb().delete(webauthnCredentials).where(eq(webauthnCredentials.id, id)).run();
}
