import { describe, expect, it } from "vitest";
import { randomBytes } from "node:crypto";
import {
  aeadDecrypt,
  aeadDecryptString,
  aeadEncrypt,
  aeadEncryptString,
} from "../aead.js";

describe("aead", () => {
  it("round-trips a string with AAD", () => {
    const key = randomBytes(32);
    const sealed = aeadEncryptString(key, "hello world", "user1|title");
    expect(sealed.length).toBeGreaterThan(12 + 16);
    const out = aeadDecryptString(key, sealed, "user1|title");
    expect(out).toBe("hello world");
  });

  it("rejects wrong AAD", () => {
    const key = randomBytes(32);
    const sealed = aeadEncryptString(key, "secret", "user1|title");
    expect(() => aeadDecryptString(key, sealed, "user1|url")).toThrow();
  });

  it("rejects wrong key", () => {
    const k1 = randomBytes(32);
    const k2 = randomBytes(32);
    const sealed = aeadEncrypt(k1, Buffer.from("x"));
    expect(() => aeadDecrypt(k2, sealed)).toThrow();
  });

  it("rejects truncated ciphertext", () => {
    const key = randomBytes(32);
    const sealed = aeadEncrypt(key, Buffer.from("hello"));
    const truncated = sealed.subarray(0, sealed.length - 1);
    expect(() => aeadDecrypt(key, truncated)).toThrow();
  });

  it("uses a fresh IV on each call (no nonce reuse)", () => {
    const key = randomBytes(32);
    const a = aeadEncryptString(key, "same plaintext");
    const b = aeadEncryptString(key, "same plaintext");
    expect(a.equals(b)).toBe(false);
  });

  it("rejects keys of wrong length", () => {
    expect(() => aeadEncrypt(randomBytes(16), Buffer.from("x"))).toThrow();
  });
});
