import { describe, expect, test } from "bun:test";
import { decrypt, encrypt } from "./encryption";

describe("encryption", () => {
  test("decrypt(encrypt(x)) round-trips to the original value", () => {
    const original = "sk-a-real-looking-api-key-1234567890";
    const encrypted = encrypt(original);
    expect(decrypt(encrypted)).toBe(original);
  });

  test("encrypted output does not contain the plaintext", () => {
    const original = "super-secret-api-key";
    const encrypted = encrypt(original);
    expect(encrypted).not.toContain(original);
  });

  test("encrypting the same value twice produces different ciphertext", () => {
    // cryptr uses a random IV per call, so identical plaintext should not
    // produce identical ciphertext (avoids leaking "these two credentials
    // are the same value" from stored data alone).
    const original = "same-key-value";
    expect(encrypt(original)).not.toBe(encrypt(original));
  });
});
