import { describe, expect, mock, test } from "bun:test";
import { MockLanguageModelV3 } from "ai/test";

let currentModel: MockLanguageModelV3;
let capturedBaseUrl: string | undefined;

const CREDENTIAL_ROWS: Record<string, { value: string | null; config: unknown } | undefined> = {
  "cred-1": { value: null, config: { baseUrl: "http://localhost:11434" } },
  "cred-2": { value: null, config: null },
};

mock.module("@/lib/db", () => ({
  prisma: {
    credential: {
      findFirst: async ({ where }: { where: { id: string } }) => CREDENTIAL_ROWS[where.id] ?? null,
    },
  },
}));

mock.module("@/lib/encryption", () => ({
  decrypt: () => "fake-api-key",
  encrypt: (text: string) => text,
}));

mock.module("ollama-ai-provider-v2", () => ({
  createOllama: (options: { baseURL?: string }) => {
    capturedBaseUrl = options.baseURL;
    return () => currentModel;
  },
}));

const { OllamaExecutor } = await import("./executor");

const fakeStep = {
  run: async <T>(_name: string, fn: () => Promise<T>) => fn(),
} as unknown as Parameters<typeof OllamaExecutor>[0]["step"];

function textResult(text: string) {
  return {
    content: [{ type: "text", text }],
    finishReason: { unified: "stop", raw: "stop" },
    usage: {
      inputTokens: { total: undefined, noCache: undefined, cacheRead: undefined, cacheWrite: undefined },
      outputTokens: { total: undefined, text: undefined, reasoning: undefined },
    },
    warnings: [],
  };
}

describe("OllamaExecutor", () => {
  test("runs against a credential with no stored API key, using config.baseUrl", async () => {
    currentModel = new MockLanguageModelV3({
      doGenerate: async () => textResult("hi from ollama") as never,
    });

    const result = await OllamaExecutor({
      data: { variableName: "result", credentialId: "cred-1", userPrompt: "hi" },
      nodeId: "node-1",
      userId: "user-1",
      context: {},
      step: fakeStep,
      getExecutor: () => {
        throw new Error("not used");
      },
      allNodes: [],
      allConnections: [],
    });

    expect(capturedBaseUrl).toBe("http://localhost:11434/api");
    expect(result).toEqual({ context: { result: { text: "hi from ollama" } } });
  });

  test("throws NonRetriableError when the credential has no config.baseUrl", async () => {
    await expect(
      OllamaExecutor({
        data: { variableName: "result", credentialId: "cred-2", userPrompt: "hi" },
        nodeId: "node-1",
        userId: "user-1",
        context: {},
        step: fakeStep,
        getExecutor: () => {
          throw new Error("not used");
        },
        allNodes: [],
        allConnections: [],
      }),
    ).rejects.toThrow(/base url/i);
  });

  test("throws NonRetriableError when the credential doesn't exist", async () => {
    await expect(
      OllamaExecutor({
        data: { variableName: "result", credentialId: "cred-missing", userPrompt: "hi" },
        nodeId: "node-1",
        userId: "user-1",
        context: {},
        step: fakeStep,
        getExecutor: () => {
          throw new Error("not used");
        },
        allNodes: [],
        allConnections: [],
      }),
    ).rejects.toThrow(/not found/i);
  });
});
