import { aeadDecrypt, aeadEncrypt, generateDEK } from "@awesome-bookmarks/crypto";
import { masterKey } from "../auth/encryption.js";

/**
 * Group encryption.
 *
 * The group key itself no longer lives here: it is sealed to each member's
 * public key by `keys.ts`, so the server cannot open a group on its own. What
 * remains in this file is the field-level sealing that key is used for, plus
 * the master-key wrap, which is now only used by groups that deliberately
 * opted into being recoverable.
 *
 * The note that used to sit here said the server could decrypt any group's
 * content given MASTER_KEY, and named per-member wrapped keys as the fix. That
 * is what `keys.ts` does; this comment is what is left of the debt.
 */
/** Only used by the recoverable path now; new keys come from `keys.ts`. */
export function generateGroupDek(): Buffer {
  return generateDEK();
}

export function wrapGroupDek(groupId: string, dek: Buffer): Buffer {
  return aeadEncrypt(masterKey(), dek, `group|${groupId}`);
}

export function unwrapGroupDek(groupId: string, sealed: Buffer): Buffer {
  return aeadDecrypt(masterKey(), sealed, `group|${groupId}`);
}

export function sealGroupField(
  groupDek: Buffer,
  groupId: string,
  field: string,
  plaintext: string,
): Buffer {
  return aeadEncrypt(groupDek, plaintext, `${groupId}|${field}`);
}

export function openGroupField(
  groupDek: Buffer,
  groupId: string,
  field: string,
  sealed: Buffer,
): string {
  return aeadDecrypt(groupDek, sealed, `${groupId}|${field}`).toString("utf8");
}
