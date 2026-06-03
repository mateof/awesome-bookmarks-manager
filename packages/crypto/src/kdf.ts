import { hash, hashRaw, verify } from "@node-rs/argon2";
import { hkdfSync, randomBytes } from "node:crypto";

export interface Argon2Params {
  memoryCost: number;
  timeCost: number;
  parallelism: number;
}

// Tuned for ~250-500ms on a modern laptop. Adjust as hardware progresses.
export const DEFAULT_ARGON2: Argon2Params = {
  memoryCost: 64 * 1024,
  timeCost: 3,
  parallelism: 1,
};

export function generateSalt(bytes = 32): Buffer {
  return randomBytes(bytes);
}

/**
 * Derive a 32-byte key-encryption-key (KEK) from a password.
 * Uses Argon2id raw output via hashRaw — bytes only, no encoded-string parsing.
 */
export async function deriveKEK(
  password: string,
  salt: Buffer,
  params: Argon2Params = DEFAULT_ARGON2,
): Promise<Buffer> {
  const out = await hashRaw(password, {
    // algorithm defaults to Argon2id in @node-rs/argon2
    salt,
    memoryCost: params.memoryCost,
    timeCost: params.timeCost,
    parallelism: params.parallelism,
    outputLen: 32,
  });
  return Buffer.from(out);
}

export { hash as argon2Hash, verify as argon2Verify };

/**
 * HKDF-SHA256 — used to derive purpose-specific subkeys from a master key
 * (e.g. share-link content key, file-storage path obfuscation).
 */
export function hkdf(
  ikm: Buffer,
  salt: Buffer,
  info: string,
  length = 32,
): Buffer {
  const out = hkdfSync("sha256", ikm, salt, Buffer.from(info, "utf8"), length);
  return Buffer.from(out);
}
