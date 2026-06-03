import { describe, expect, it } from "vitest";
import { aeadDecryptString, aeadEncryptString } from "../aead.js";
import { deriveShareKey, generateShareToken } from "../share.js";

describe("share", () => {
  it("derives the same key from the same token", () => {
    const token = generateShareToken();
    const a = deriveShareKey(token);
    const b = deriveShareKey(token);
    expect(a.equals(b)).toBe(true);
    expect(a.length).toBe(32);
  });

  it("derives different keys for different tokens", () => {
    const a = deriveShareKey(generateShareToken());
    const b = deriveShareKey(generateShareToken());
    expect(a.equals(b)).toBe(false);
  });

  it("end-to-end seal/unseal of a payload via the token", () => {
    const token = generateShareToken();
    const key = deriveShareKey(token);
    const sealed = aeadEncryptString(key, JSON.stringify({ url: "https://x" }));

    // From a fresh derive (simulating a public viewer hitting /share/:token)
    const viewer = deriveShareKey(token);
    expect(aeadDecryptString(viewer, sealed)).toBe('{"url":"https://x"}');
  });
});
