import { randomBytes } from "node:crypto";
import { describe, expect, it } from "vitest";
import { decrypt, encrypt } from "../encryption";

const TEST_KEY = randomBytes(32).toString("hex");

describe("encryption", () => {
  it("encrypts and decrypts a string round-trip", () => {
    const plaintext = "my-secret-totp-key";
    const encrypted = encrypt(plaintext, TEST_KEY);
    expect(encrypted).not.toBe(plaintext);
    expect(encrypted).toContain(":"); // iv:ciphertext:authTag format
    const decrypted = decrypt(encrypted, TEST_KEY);
    expect(decrypted).toBe(plaintext);
  });

  it("produces different ciphertext for same plaintext (random IV)", () => {
    const plaintext = "same-input";
    const a = encrypt(plaintext, TEST_KEY);
    const b = encrypt(plaintext, TEST_KEY);
    expect(a).not.toBe(b);
  });

  it("throws on tampered ciphertext", () => {
    const encrypted = encrypt("secret", TEST_KEY);
    const [iv, ct, tag] = encrypted.split(":");
    // Flip a hex character in the ciphertext to guarantee a different byte
    const flipped = ct.charAt(0) === "a" ? "b" : "a";
    const tampered = `${iv}:${flipped}${ct.slice(1)}:${tag}`;
    expect(() => decrypt(tampered, TEST_KEY)).toThrow();
  });

  it("throws on wrong key", () => {
    const encrypted = encrypt("secret", TEST_KEY);
    const wrongKey = randomBytes(32).toString("hex");
    expect(() => decrypt(encrypted, wrongKey)).toThrow();
  });

  it("handles empty string", () => {
    const encrypted = encrypt("", TEST_KEY);
    expect(decrypt(encrypted, TEST_KEY)).toBe("");
  });

  it("handles unicode", () => {
    const plaintext = "\u{1F9A5} sloth emoji and \u00F1 accents";
    const encrypted = encrypt(plaintext, TEST_KEY);
    expect(decrypt(encrypted, TEST_KEY)).toBe(plaintext);
  });
});
