import { describe, expect, mock, test } from "bun:test";
import { MockLanguageModelV3 } from "ai/test";

let currentModel: MockLanguageModelV3;
let capturedModelId: string | undefined;
let capturedCallOptions: Record<string, unknown> | undefined;

mock.module("@/lib/db", () => ({
  prisma: {
    credential: {
      findFirst: async () => ({ value: "encrypted-fake-key" }),
    },
  },
}));

mock.module("@/lib/encryption", () => ({
  decrypt: () => "fake-api-key",
  encrypt: (text: string) => text,
}));

const { createAiExecutor } = await import("./create-ai-executor");

const fakeStep = {
  run: async <T>(_name: string, fn: () => Promise<T>) => fn(),
} as unknown as Parameters<ReturnType<typeof createAiExecutor>>[0]["step"];

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

const TestExecutor = createAiExecutor({
  providerType: "OPENAI",
  providerLabel: "OpenAI",
  defaultModel: "gpt-4o-mini",
  createModel: (_apiKey, model) => {
    capturedModelId = model;
    return currentModel;
  },
});

describe("createAiExecutor", () => {
  test("falls back to defaultModel when data.model is unset", async () => {
    currentModel = new MockLanguageModelV3({
      doGenerate: async (options) => {
        capturedCallOptions = options as unknown as Record<string, unknown>;
        return textResult("ok") as never;
      },
    });

    await TestExecutor({
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

    expect(capturedModelId).toBe("gpt-4o-mini");
  });

  test("passes temperature, maxOutputTokens, and a configured model through to generateText", async () => {
    currentModel = new MockLanguageModelV3({
      doGenerate: async (options) => {
        capturedCallOptions = options as unknown as Record<string, unknown>;
        return textResult("ok") as never;
      },
    });

    await TestExecutor({
      data: {
        variableName: "result",
        credentialId: "cred-1",
        userPrompt: "hi",
        model: "gpt-4o",
        temperature: 0.2,
        maxTokens: 256,
      },
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

    expect(capturedModelId).toBe("gpt-4o");
    expect(capturedCallOptions?.temperature).toBe(0.2);
    expect(capturedCallOptions?.maxOutputTokens).toBe(256);
  });
});
