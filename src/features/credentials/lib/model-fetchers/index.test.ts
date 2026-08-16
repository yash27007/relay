import { describe, expect, mock, test } from "bun:test";

mock.module("@/lib/encryption", () => ({
  decrypt: (value: string) => value.replace("encrypted:", ""),
  encrypt: (value: string) => `encrypted:${value}`,
}));

const { modelFetchers } = await import("./index");

describe("modelFetchers", () => {
  test("has an entry for every CredentialType", async () => {
    const { CredentialType } = await import("@/generated/prisma/enums");
    for (const type of Object.values(CredentialType)) {
      expect(modelFetchers[type]).toBeDefined();
    }
  });

  test("a provider fetcher throws a readable error when the credential has no stored key", async () => {
    await expect(
      modelFetchers.OPENAI({ value: null, config: null }),
    ).rejects.toThrow(/API key/i);
  });

  test("Ollama's fetcher throws a readable error when config.baseUrl is missing", async () => {
    await expect(
      modelFetchers.OLLAMA({ value: null, config: null }),
    ).rejects.toThrow(/base url/i);
  });
});
