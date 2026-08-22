import {
  createPrivateKey,
  createPublicKey,
  diffieHellman,
  generateKeyPairSync,
  hkdfSync,
  randomBytes,
} from "node:crypto";
import { aeadDecrypt, aeadEncrypt } from "./aead.js";

/**
 * Per-user keypairs, so a secret can be handed to somebody who is offline
 * without the secret ever travelling.
 *
 * This is what makes group keys work without the server holding them. To add
 * someone to a group you seal the group key **to their public key**; only their
 * private key opens it, and their private key never leaves their own sealed
 * storage. The alternative people reach for first, generating a shared secret
 * at invitation time and sending it along, puts a live key in an email, a URL
 * and a log file.
 *
 * X25519 with an ephemeral sender key (the classic ECIES shape, and what `age`
 * does): each seal generates a throwaway keypair, derives a shared secret with
 * the recipient's public key, and uses it once. Two seals of the same key to
 * the same person share nothing, so the ciphertexts cannot be correlated.
 */

const KEY_TYPE = "x25519";
const HKDF_INFO = "awesomebookmarks/x25519-seal/v1";

export interface KeyPairRaw {
  /** Raw 32-byte public key, safe to publish. */
  publicKey: Buffer;
  /** Raw 32-byte private key. The caller must seal this before storing it. */
  privateKey: Buffer;
}

/** Raw-bytes helpers: the DB stores 32-byte blobs, not PEM. */
function publicFromRaw(raw: Buffer) {
  // SPKI prefix for X25519, so raw keys can be stored as 32 bytes rather than
  // as PEM text that would triple the column size for no benefit.
  const spki = Buffer.concat([
    Buffer.from("302a300506032b656e032100", "hex"),
    raw,
  ]);
  return createPublicKey({ key: spki, format: "der", type: "spki" });
}

function privateFromRaw(raw: Buffer) {
  const pkcs8 = Buffer.concat([
    Buffer.from("302e020100300506032b656e04220420", "hex"),
    raw,
  ]);
  return createPrivateKey({ key: pkcs8, format: "der", type: "pkcs8" });
}

function rawOf(key: ReturnType<typeof createPublicKey>): Buffer {
  const der = key.export({ format: "der", type: "spki" }) as Buffer;
  return der.subarray(der.length - 32);
}

function rawOfPrivate(key: ReturnType<typeof createPrivateKey>): Buffer {
  const der = key.export({ format: "der", type: "pkcs8" }) as Buffer;
  return der.subarray(der.length - 32);
}

export function generateKeyPair(): KeyPairRaw {
  const { publicKey, privateKey } = generateKeyPairSync(KEY_TYPE);
  return {
    publicKey: rawOf(publicKey),
    privateKey: rawOfPrivate(privateKey),
  };
}

function derive(shared: Buffer, ephemeralPublic: Buffer): Buffer {
  // The ephemeral public key goes into the salt, binding the derived key to
  // this exact exchange: the same shared secret used twice cannot produce the
  // same AES key.
  return Buffer.from(
    hkdfSync("sha256", shared, ephemeralPublic, HKDF_INFO, 32),
  );
}

/**
 * Seal bytes so that only the holder of the matching private key can open
 * them. Output layout: ephemeralPublic(32) || aeadBlob.
 */
export function sealToPublicKey(
  recipientPublicRaw: Buffer,
  plaintext: Buffer,
  aad?: string,
): Buffer {
  if (recipientPublicRaw.length !== 32) {
    throw new Error("X25519 public key must be 32 bytes");
  }
  const ephemeral = generateKeyPairSync(KEY_TYPE);
  const shared = diffieHellman({
    privateKey: ephemeral.privateKey,
    publicKey: publicFromRaw(recipientPublicRaw),
  });
  const ephemeralPublic = rawOf(ephemeral.publicKey);
  const key = derive(shared, ephemeralPublic);
  return Buffer.concat([ephemeralPublic, aeadEncrypt(key, plaintext, aad)]);
}

export function openWithPrivateKey(
  recipientPrivateRaw: Buffer,
  sealed: Buffer,
  aad?: string,
): Buffer {
  if (recipientPrivateRaw.length !== 32) {
    throw new Error("X25519 private key must be 32 bytes");
  }
  if (sealed.length <= 32) throw new Error("Sealed blob too short");
  const ephemeralPublic = sealed.subarray(0, 32);
  const shared = diffieHellman({
    privateKey: privateFromRaw(recipientPrivateRaw),
    publicKey: publicFromRaw(ephemeralPublic),
  });
  const key = derive(shared, ephemeralPublic);
  return aeadDecrypt(key, sealed.subarray(32), aad);
}

/** Random 32 bytes, for a group key. Named for what it is used for. */
export function generateGroupKey(): Buffer {
  return randomBytes(32);
}
