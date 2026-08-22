import { describe, expect, it } from "vitest";
import {
  generateKeyPair,
  openWithPrivateKey,
  sealToPublicKey,
} from "../asymmetric.js";

describe("x25519 sealing", () => {
  it("round-trips for the intended recipient", () => {
    const bob = generateKeyPair();
    const secret = Buffer.from("a".repeat(32));
    const sealed = sealToPublicKey(bob.publicKey, secret, "group|abc");
    expect(openWithPrivateKey(bob.privateKey, sealed, "group|abc")).toEqual(
      secret,
    );
  });

  it("is useless to anybody else", () => {
    const bob = generateKeyPair();
    const eve = generateKeyPair();
    const sealed = sealToPublicKey(bob.publicKey, Buffer.alloc(32, 7));
    expect(() => openWithPrivateKey(eve.privateKey, sealed)).toThrow();
  });

  it("binds the AAD, so a blob cannot be moved between groups", () => {
    const bob = generateKeyPair();
    const sealed = sealToPublicKey(bob.publicKey, Buffer.alloc(32, 1), "group|a");
    expect(() => openWithPrivateKey(bob.privateKey, sealed, "group|b")).toThrow();
  });

  it("produces a different blob every time", () => {
    // The ephemeral key makes two seals of the same secret to the same person
    // uncorrelatable. Without it, a snapshot of the table would show at a
    // glance which members hold the same key.
    const bob = generateKeyPair();
    const secret = Buffer.alloc(32, 3);
    const a = sealToPublicKey(bob.publicKey, secret);
    const b = sealToPublicKey(bob.publicKey, secret);
    expect(a.equals(b)).toBe(false);
    expect(openWithPrivateKey(bob.privateKey, a)).toEqual(secret);
    expect(openWithPrivateKey(bob.privateKey, b)).toEqual(secret);
  });

  it("rejects keys that are not X25519 sized", () => {
    expect(() => sealToPublicKey(Buffer.alloc(16), Buffer.alloc(4))).toThrow();
  });
});
