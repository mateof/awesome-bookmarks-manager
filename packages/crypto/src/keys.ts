import { randomBytes } from "node:crypto";
import { aeadDecrypt, aeadEncrypt } from "./aead.js";

/** 256-bit Data Encryption Key. */
export function generateDEK(): Buffer {
  return randomBytes(32);
}

export function wrapKey(kek: Buffer, dek: Buffer, aad?: string): Buffer {
  return aeadEncrypt(kek, dek, aad);
}

export function unwrapKey(kek: Buffer, sealed: Buffer, aad?: string): Buffer {
  const out = aeadDecrypt(kek, sealed, aad);
  if (out.length !== 32) {
    throw new Error("Unwrapped key length unexpected");
  }
  return out;
}

/**
 * Decode the master key from a base64 string at boot.
 * Throws if invalid or wrong length.
 */
export function loadMasterKey(b64: string | undefined): Buffer {
  if (!b64) {
    throw new Error("MASTER_KEY env is required");
  }
  const buf = Buffer.from(b64, "base64");
  if (buf.length !== 32) {
    throw new Error(
      `MASTER_KEY must decode to 32 bytes (got ${buf.length}); generate with: openssl rand -base64 32`,
    );
  }
  return buf;
}
