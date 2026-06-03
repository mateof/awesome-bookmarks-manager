import {
  aeadDecrypt,
  aeadEncrypt,
  loadMasterKey,
} from "@awesome-bookmarks/crypto";
import { getEnv } from "../env.js";

let _masterKey: Buffer | null = null;

export function masterKey(): Buffer {
  if (!_masterKey) {
    _masterKey = loadMasterKey(getEnv().MASTER_KEY);
  }
  return _masterKey;
}

/** Field-level helpers used by services to seal/unseal user content. */
export function sealField(
  dek: Buffer,
  userId: string,
  field: string,
  plaintext: string,
): Buffer {
  return aeadEncrypt(dek, plaintext, `${userId}|${field}`);
}

export function openField(
  dek: Buffer,
  userId: string,
  field: string,
  sealed: Buffer,
): string {
  return aeadDecrypt(dek, sealed, `${userId}|${field}`).toString("utf8");
}

/** Wrap/unwrap a wrapped-DEK envelope with the master key. */
export function masterWrap(userId: string, wrappedDek: Buffer): Buffer {
  return aeadEncrypt(masterKey(), wrappedDek, `master|${userId}`);
}

export function masterUnwrap(userId: string, sealed: Buffer): Buffer {
  return aeadDecrypt(masterKey(), sealed, `master|${userId}`);
}
