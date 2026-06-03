import { hash, verify } from "@node-rs/argon2";

/**
 * Password hash for login verification (separate from KEK derivation).
 * Returns the encoded string ($argon2id$...) suitable for storage.
 * Algorithm defaults to Argon2id in @node-rs/argon2.
 */
export async function hashPassword(password: string): Promise<string> {
  return hash(password, {
    memoryCost: 64 * 1024,
    timeCost: 3,
    parallelism: 1,
  });
}

export async function verifyPassword(
  encoded: string,
  password: string,
): Promise<boolean> {
  try {
    return await verify(encoded, password);
  } catch {
    return false;
  }
}
