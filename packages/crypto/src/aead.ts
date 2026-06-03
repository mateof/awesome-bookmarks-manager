import { createCipheriv, createDecipheriv, randomBytes } from "node:crypto";

const AES_GCM = "aes-256-gcm";
const IV_LEN = 12;
const TAG_LEN = 16;

export interface SealedBlob {
  // [iv (12) | tag (16) | ciphertext]
  bytes: Buffer;
}

/**
 * AES-256-GCM. Output layout: iv(12) || tag(16) || ciphertext.
 * AAD is bound to (userId, fieldName) at the call site to prevent
 * cross-field/cross-user blob substitution.
 */
export function aeadEncrypt(
  key: Buffer,
  plaintext: Buffer | string,
  aad?: Buffer | string,
): Buffer {
  if (key.length !== 32) {
    throw new Error("AEAD key must be 32 bytes");
  }
  const iv = randomBytes(IV_LEN);
  const cipher = createCipheriv(AES_GCM, key, iv);
  if (aad !== undefined) {
    cipher.setAAD(typeof aad === "string" ? Buffer.from(aad, "utf8") : aad);
  }
  const pt = typeof plaintext === "string" ? Buffer.from(plaintext, "utf8") : plaintext;
  const ct = Buffer.concat([cipher.update(pt), cipher.final()]);
  const tag = cipher.getAuthTag();
  return Buffer.concat([iv, tag, ct]);
}

export function aeadDecrypt(
  key: Buffer,
  sealed: Buffer,
  aad?: Buffer | string,
): Buffer {
  if (key.length !== 32) {
    throw new Error("AEAD key must be 32 bytes");
  }
  if (sealed.length < IV_LEN + TAG_LEN) {
    throw new Error("Sealed blob too short");
  }
  const iv = sealed.subarray(0, IV_LEN);
  const tag = sealed.subarray(IV_LEN, IV_LEN + TAG_LEN);
  const ct = sealed.subarray(IV_LEN + TAG_LEN);
  const decipher = createDecipheriv(AES_GCM, key, iv);
  decipher.setAuthTag(tag);
  if (aad !== undefined) {
    decipher.setAAD(typeof aad === "string" ? Buffer.from(aad, "utf8") : aad);
  }
  return Buffer.concat([decipher.update(ct), decipher.final()]);
}

export function aeadEncryptString(
  key: Buffer,
  plaintext: string,
  aad?: string,
): Buffer {
  return aeadEncrypt(key, plaintext, aad);
}

export function aeadDecryptString(
  key: Buffer,
  sealed: Buffer,
  aad?: string,
): string {
  return aeadDecrypt(key, sealed, aad).toString("utf8");
}
