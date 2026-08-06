import { aeadDecrypt, aeadEncrypt, hkdf } from "@awesome-bookmarks/crypto";
import { masterUnwrap, masterWrap } from "./encryption.js";

/**
 * Headless API tokens must be able to unlock the user's DEK without an
 * interactive password login. We achieve that by wrapping the DEK with a
 * key derived from the token's own secret, then sealing that envelope with
 * the server master key.
 *
 *   tokenKEK = HKDF-SHA256(rawSecretBytes, salt = "<userId>:<tokenId>",
 *                          info = "api-token-dek")
 *   envelope = masterWrap(userId, AES-GCM(tokenKEK, dek))
 *
 * To decrypt data with a token you need BOTH the token secret AND the
 * server master key + DB row. Same two-of-two property as the password
 * path (password + master key), with the token secret replacing the
 * password. Revoking the token (deleting the row) destroys the envelope.
 */

function tokenKek(userId: string, tokenId: string, rawSecret: string): Buffer {
  // rawSecret is the base64url-encoded 32 random bytes minted in createToken.
  const ikm = Buffer.from(rawSecret, "base64url");
  return hkdf(ikm, Buffer.from(`${userId}:${tokenId}`, "utf8"), "api-token-dek", 32);
}

export function wrapDekForToken(
  userId: string,
  tokenId: string,
  rawSecret: string,
  dek: Buffer,
): Buffer {
  const kek = tokenKek(userId, tokenId, rawSecret);
  const tokenWrapped = aeadEncrypt(kek, dek, `apitoken|${tokenId}`);
  return masterWrap(userId, tokenWrapped);
}

export function unwrapDekForToken(
  userId: string,
  tokenId: string,
  rawSecret: string,
  dekWrap: Buffer,
): Buffer {
  const tokenWrapped = masterUnwrap(userId, dekWrap);
  const kek = tokenKek(userId, tokenId, rawSecret);
  const dek = aeadDecrypt(kek, tokenWrapped, `apitoken|${tokenId}`);
  if (dek.length !== 32) throw new Error("Unwrapped DEK length unexpected");
  return dek;
}
