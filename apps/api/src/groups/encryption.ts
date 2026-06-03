import { aeadDecrypt, aeadEncrypt, generateDEK } from "@awesome-bookmarks/crypto";
import { masterKey } from "../auth/encryption.js";

/**
 * Group encryption (v1).
 *
 * Each group has a 256-bit `group_dek` generated at creation. It is wrapped
 * with the server master key only (NOT the owner's password-derived key) so
 * any group member can read shared content even when the owner is offline.
 *
 * Tradeoff: the server can decrypt group-shared content unilaterally given
 * the master key. Personal items keep their stronger password-tier protection.
 * If you need stronger group privacy in the future, switch to per-member
 * wrapped keys (each member holds the group_dek wrapped by their user DEK).
 */
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
