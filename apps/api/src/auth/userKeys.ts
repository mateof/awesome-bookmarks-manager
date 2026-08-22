import { generateKeyPair, openWithPrivateKey } from "@awesome-bookmarks/crypto";
import { eq } from "drizzle-orm";
import { openField, sealField } from "./encryption.js";
import { getDb } from "../db/client.js";
import { users } from "../db/schema.js";
import { NotFound } from "../util/errors.js";

/**
 * Every account gets an X25519 keypair.
 *
 * It exists so a group key can be handed to somebody who is not online: you
 * seal it to their public key and they open it later with their private one.
 * Nothing secret ever travels, which is the difference between this and the
 * obvious alternative of generating a shared key at invitation time and
 * emailing it.
 *
 * The public half is stored in the clear (that is the point of a public key).
 * The private half is sealed with the user's own DEK, so it is exactly as well
 * protected as their bookmarks: readable while they are logged in, unreadable
 * at rest without their password.
 */

const AAD = "user.kx";

/**
 * The keypair, generated on first use.
 *
 * Lazily rather than only at signup, because accounts created before this
 * existed have to get one too, and the only moment the server can seal a
 * private key for them is while it holds their DEK. That is any authenticated
 * request, so the first one after the upgrade does it.
 */
export function ensureUserKeys(
  userId: string,
  dek: Buffer,
): { publicKey: Buffer; privateKey: Buffer } {
  const row = getDb()
    .select({ kxPublic: users.kxPublic, kxPrivateCt: users.kxPrivateCt })
    .from(users)
    .where(eq(users.id, userId))
    .get();
  if (!row) throw NotFound("User not found");

  if (row.kxPublic && row.kxPrivateCt) {
    return {
      publicKey: Buffer.from(row.kxPublic),
      privateKey: Buffer.from(
        openField(dek, userId, AAD, Buffer.from(row.kxPrivateCt)),
        "base64",
      ),
    };
  }

  const pair = generateKeyPair();
  getDb()
    .update(users)
    .set({
      kxPublic: pair.publicKey,
      kxPrivateCt: sealField(
        dek,
        userId,
        AAD,
        pair.privateKey.toString("base64"),
      ),
    })
    .where(eq(users.id, userId))
    .run();
  return pair;
}

/**
 * Somebody else's public key, for sealing a group key to them.
 *
 * Returns null when they have never signed in since keypairs existed: there is
 * nothing to seal to yet. Callers treat that as "invite them, wrap the key
 * when they accept", which is the honest behaviour rather than inventing a
 * keypair the user cannot open.
 */
export function publicKeyOf(userId: string): Buffer | null {
  const row = getDb()
    .select({ kxPublic: users.kxPublic })
    .from(users)
    .where(eq(users.id, userId))
    .get();
  return row?.kxPublic ? Buffer.from(row.kxPublic) : null;
}

/** Open something sealed to this user's public key. */
export function openSealedForUser(
  userId: string,
  dek: Buffer,
  sealed: Buffer,
  aad?: string,
): Buffer {
  const { privateKey } = ensureUserKeys(userId, dek);
  return openWithPrivateKey(privateKey, sealed, aad);
}
