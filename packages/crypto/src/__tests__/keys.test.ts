import { describe, expect, it } from "vitest";
import { randomBytes } from "node:crypto";
import { generateDEK, loadMasterKey, unwrapKey, wrapKey } from "../keys.js";

describe("keys", () => {
  it("generates a 32-byte DEK", () => {
    const dek = generateDEK();
    expect(dek.length).toBe(32);
  });

  it("wraps and unwraps a DEK with a KEK", () => {
    const kek = randomBytes(32);
    const dek = generateDEK();
    const wrapped = wrapKey(kek, dek, "user1");
    const unwrapped = unwrapKey(kek, wrapped, "user1");
    expect(unwrapped.equals(dek)).toBe(true);
  });

  it("rejects unwrap with wrong AAD", () => {
    const kek = randomBytes(32);
    const dek = generateDEK();
    const wrapped = wrapKey(kek, dek, "user1");
    expect(() => unwrapKey(kek, wrapped, "user2")).toThrow();
  });

  it("loads a 32-byte master key from base64", () => {
    const raw = randomBytes(32);
    const buf = loadMasterKey(raw.toString("base64"));
    expect(buf.equals(raw)).toBe(true);
  });

  it("rejects a master key of wrong length", () => {
    const wrong = randomBytes(16).toString("base64");
    expect(() => loadMasterKey(wrong)).toThrow();
  });

  it("rejects an undefined master key", () => {
    expect(() => loadMasterKey(undefined)).toThrow();
  });
});
