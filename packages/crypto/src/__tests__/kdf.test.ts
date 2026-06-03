import { describe, expect, it } from "vitest";
import { randomBytes } from "node:crypto";
import { deriveKEK, generateSalt, hkdf } from "../kdf.js";

const FAST_PARAMS = { memoryCost: 8 * 1024, timeCost: 1, parallelism: 1 };

describe("kdf", () => {
  it("derives a 32-byte KEK deterministically for a given salt+password", async () => {
    const salt = generateSalt();
    const a = await deriveKEK("correct horse battery staple", salt, FAST_PARAMS);
    const b = await deriveKEK("correct horse battery staple", salt, FAST_PARAMS);
    expect(a.length).toBe(32);
    expect(a.equals(b)).toBe(true);
  });

  it("produces a different KEK for a different salt", async () => {
    const a = await deriveKEK("pw", generateSalt(), FAST_PARAMS);
    const b = await deriveKEK("pw", generateSalt(), FAST_PARAMS);
    expect(a.equals(b)).toBe(false);
  });

  it("produces a different KEK for a different password", async () => {
    const salt = generateSalt();
    const a = await deriveKEK("pw1", salt, FAST_PARAMS);
    const b = await deriveKEK("pw2", salt, FAST_PARAMS);
    expect(a.equals(b)).toBe(false);
  });

  it("hkdf is deterministic and length-configurable", () => {
    const ikm = randomBytes(32);
    const salt = randomBytes(16);
    const a = hkdf(ikm, salt, "purpose", 32);
    const b = hkdf(ikm, salt, "purpose", 32);
    const c = hkdf(ikm, salt, "different", 32);
    const d = hkdf(ikm, salt, "purpose", 16);
    expect(a.equals(b)).toBe(true);
    expect(a.equals(c)).toBe(false);
    expect(d.length).toBe(16);
  });
});
