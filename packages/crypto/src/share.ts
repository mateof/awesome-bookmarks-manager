import { randomBytes } from "node:crypto";
import { hkdf } from "./kdf.js";

/**
 * Share token — random URL-safe identifier used as both lookup id and
 * input to the content encryption key. The server only ever sees the token
 * when the request URL carries it.
 */
export function generateShareToken(): string {
  return randomBytes(32).toString("base64url");
}

export function deriveShareKey(token: string): Buffer {
  // The token is the IKM. A fixed salt + purpose info pins the derivation.
  const ikm = Buffer.from(token, "base64url");
  const salt = Buffer.from("awesome-bookmarks/share/v1", "utf8");
  return hkdf(ikm, salt, "share-content", 32);
}
