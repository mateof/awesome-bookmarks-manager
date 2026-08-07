import { eq } from "drizzle-orm";
import { getDb } from "../db/client.js";
import { users } from "../db/schema.js";
import { BadRequest, NotFound } from "../util/errors.js";
import { openField, sealField } from "./encryption.js";
import type { AuthedContext } from "./session.js";
import { generateTotpSecret, otpauthUri, verifyTotp } from "./totp.js";

const FIELD = "twofa.secret";

export function twoFactorEnabled(userId: string): boolean {
  const row = getDb()
    .select({ e: users.twoFactorEnabled })
    .from(users)
    .where(eq(users.id, userId))
    .get();
  return !!row?.e;
}

/**
 * Generate a fresh secret and stash it (sealed with the user's DEK) as the
 * pending secret. Returns the base32 secret + otpauth URI for the QR. Nothing
 * is enforced until `enableTwoFactor` confirms a valid code.
 */
export function beginTwoFactorSetup(ctx: AuthedContext): {
  secret: string;
  otpauthUri: string;
} {
  const row = getDb()
    .select({ email: users.email, nickname: users.nickname })
    .from(users)
    .where(eq(users.id, ctx.userId))
    .get();
  if (!row) throw NotFound("User not found");
  const secret = generateTotpSecret();
  const sealed = sealField(ctx.dek, ctx.userId, FIELD, secret);
  getDb()
    .update(users)
    .set({ twoFactorPendingCt: sealed, updatedAt: new Date().toISOString() })
    .where(eq(users.id, ctx.userId))
    .run();
  return { secret, otpauthUri: otpauthUri(secret, row.nickname || row.email) };
}

export function enableTwoFactor(ctx: AuthedContext, code: string) {
  const row = getDb()
    .select({ pending: users.twoFactorPendingCt })
    .from(users)
    .where(eq(users.id, ctx.userId))
    .get();
  if (!row?.pending) throw BadRequest("No hay un 2FA pendiente de confirmar");
  const secret = openField(ctx.dek, ctx.userId, FIELD, Buffer.from(row.pending));
  if (!verifyTotp(secret, code)) throw BadRequest("Código incorrecto");
  getDb()
    .update(users)
    .set({
      twoFactorEnabled: true,
      twoFactorSecretCt: Buffer.from(row.pending),
      twoFactorPendingCt: null,
      updatedAt: new Date().toISOString(),
    })
    .where(eq(users.id, ctx.userId))
    .run();
}

export function disableTwoFactor(ctx: AuthedContext, code: string) {
  const row = getDb()
    .select({
      enabled: users.twoFactorEnabled,
      secret: users.twoFactorSecretCt,
    })
    .from(users)
    .where(eq(users.id, ctx.userId))
    .get();
  if (!row?.enabled || !row.secret) {
    // Not enabled: just make sure no half-finished enrollment lingers.
    getDb()
      .update(users)
      .set({ twoFactorPendingCt: null })
      .where(eq(users.id, ctx.userId))
      .run();
    return;
  }
  const secret = openField(ctx.dek, ctx.userId, FIELD, Buffer.from(row.secret));
  if (!verifyTotp(secret, code)) throw BadRequest("Código incorrecto");
  clearTwoFactor(ctx.userId);
}

/** Admin recovery: wipe a user's 2FA without their code. */
export function clearTwoFactor(userId: string) {
  getDb()
    .update(users)
    .set({
      twoFactorEnabled: false,
      twoFactorSecretCt: null,
      twoFactorPendingCt: null,
      updatedAt: new Date().toISOString(),
    })
    .where(eq(users.id, userId))
    .run();
}
