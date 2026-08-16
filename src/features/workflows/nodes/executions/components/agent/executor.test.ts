import { describe, expect, mock, test } from "bun:test";
import { NonRetriableError } from "inngest";
import { MockLanguageModelV3 } from "ai/test";
import type { LanguageModelV3GenerateResult } from "@ai-sdk/provider";
import type { Connection, Node } from "@/generated/prisma/client";
import type { NodeExecutor } from "../../types";
import type { AgentNodeData } from "./types";

// This executor's own tool-error catch (see executor.ts) can never be
// exercised by hitting `generateText` with a real provider — doing so would
// require a real network call and a real credential. `ai@6.0.31` ships
// `ai/test`'s `MockLanguageModelV3`, a zero-network `LanguageModelV3`
// implementation the real `generateText` can call, which is exactly the
// seam that lets this test drive the real tool-calling loop end-to-end.
//
// `createModel` (executor.ts) has no injection point for a custom
// `LanguageModel` — it hardcodes real `@ai-sdk/*` provider factories. The
// only way to get `MockLanguageModelV3` in front of the real `generateText`
// without touching executor.ts's source is to mock the `@ai-sdk/openai`
// module itself so its `createOpenAI(...)(...)` call returns our mock
// model instead of a real OpenAI client. `@/lib/db` and `@/lib/encryption`
// are mocked for the same "avoid a real dependency" reason — a real
// Postgres connection and real ciphertext, respectively.
//
// All three `mock.module` calls must run before `./executor` is first
// imported (static imports of `@/lib/db`/`@/lib/encryption`/`@ai-sdk/openai`
// inside executor.ts would otherwise load the real modules first) — hence
// the dynamic `import()` below instead of a static one.

let currentModel: MockLanguageModelV3;

mock.module("@/lib/db", () => ({
  prisma: {
    credential: {
      findFirst: async () => ({ value: "encrypted-fake-credential-value" }),
    },
  },
}));

mock.module("@/lib/encryption", () => ({
  decrypt: () => "fake-api-key",
  encrypt: (text: string) => text,
}));

mock.module("@ai-sdk/openai", () => ({
  createOpenAI: () => () => currentModel,
}));

const { AgentExecutor } = await import("./executor");

const fakeStep = {
  run: async <T>(_name: string, fn: () => Promise<T>) => fn(),
} as unknown as Parameters<typeof AgentExecutor>[0]["step"];

function makeNode(id: string, type: string, data: Record<string, unknown> = {}): Node {
  return {
    id,
    workflowId: "workflow-1",
    name: type,
    type: type as Node["type"],
    position: { x: 0, y: 0 },
    data,
    createdAt: new Date(),
    updatedAt: new Date(),
  } as unknown as Node;
}

function makeConnection(fromNodeId: string, toNodeId: string, toInput: string): Connection {
  return {
    id: `${fromNodeId}->${toNodeId}`,
    workflowId: "workflow-1",
    fromNodeId,
    toNodeId,
    fromOutput: `${fromNodeId}-tool-source`,
    toInput,
    createdAt: new Date(),
    updatedAt: new Date(),
  } as unknown as Connection;
}

function makeAgentNode(data: Partial<AgentNodeData> = {}): Node {
  return makeNode("agent-1", "AGENT", {
    variableName: "result",
    provider: "OPENAI",
    credentialId: "cred-1",
    userPrompt: "Do the thing",
    ...data,
  });
}

const emptyUsage = {
  inputTokens: { total: undefined, noCache: undefined, cacheRead: undefined, cacheWrite: undefined },
  outputTokens: { total: undefined, text: undefined, reasoning: undefined },
};

function toolCallResult(toolName: string, callId = "call-1"): LanguageModelV3GenerateResult {
  return {
    content: [{ type: "tool-call", toolCallId: callId, toolName, input: "{}" }],
    finishReason: { unified: "tool-calls", raw: "tool_calls" },
    usage: emptyUsage,
    warnings: [],
  } as unknown as LanguageModelV3GenerateResult;
}

function textResult(text: string): LanguageModelV3GenerateResult {
  return {
    content: [{ type: "text", text }],
    finishReason: { unified: "stop", raw: "stop" },
    usage: emptyUsage,
    warnings: [],
  } as unknown as LanguageModelV3GenerateResult;
}

/**
 * A MockLanguageModelV3 that returns `results[n]` on its (n+1)th
 * `doGenerate` call (clamped to the last entry), driven by our own call
 * counter rather than the array-indexing `doGenerate` option built into
 * MockLanguageModelV3 itself, whose off-by-one indexing (it increments its
 * internal call log before indexing into the array) makes it easy to
 * misuse for a >1-call sequence.
 */
function makeSequencedModel(results: LanguageModelV3GenerateResult[]): MockLanguageModelV3 {
  let call = 0;
  return new MockLanguageModelV3({
    doGenerate: async () => {
      const result = results[Math.min(call, results.length - 1)];
      call++;
      return result;
    },
  });
}

const toolNode = makeNode("tool-1", "HTTP_REQUEST", {
  variableName: "toolResult",
  aiTool: { description: "A test tool", parameters: [] },
});
const toolConnection = makeConnection("tool-1", "agent-1", "agent-1-tool-target");

describe("AgentExecutor tool-error handling", () => {
  test("a connected tool throwing a generic Error does not abort the run — the executor finishes with the model's text", async () => {
    currentModel = makeSequencedModel([
      toolCallResult("tool-1"),
      textResult("Handled the tool failure and finished."),
    ]);

    const agentNode = makeAgentNode();
    const getExecutor = (): NodeExecutor => async () => {
      throw new Error("tool exploded");
    };

    const result = await AgentExecutor({
      data: agentNode.data as AgentNodeData,
      nodeId: "agent-1",
      userId: "test-user",
      context: {},
      step: fakeStep,
      getExecutor,
      allNodes: [agentNode, toolNode],
      allConnections: [toolConnection],
    });

    expect(result).toEqual({
      context: { result: { text: "Handled the tool failure and finished." } },
    });
  });

  test("a connected tool throwing NonRetriableError does not abort the run either — Fix 1's revert", async () => {
    // This is the exact regression this fix round exists to prevent: an
    // earlier revision re-threw NonRetriableError out of the tool's
    // execute() specifically to abort the run. That doesn't work (ai@6.0.31
    // swallows any throw from execute() into a tool-error part before it
    // ever reaches generateText's caller), so the current code no longer
    // tries — this test pins down the observable result: the executor
    // still completes normally, it never rejects.
    currentModel = makeSequencedModel([
      toolCallResult("tool-1"),
      textResult("Handled the NonRetriableError and finished."),
    ]);

    const agentNode = makeAgentNode();
    const getExecutor = (): NodeExecutor => async () => {
      throw new NonRetriableError("tool config is broken");
    };

    const result = await AgentExecutor({
      data: agentNode.data as AgentNodeData,
      nodeId: "agent-1",
      userId: "test-user",
      context: {},
      step: fakeStep,
      getExecutor,
      allNodes: [agentNode, toolNode],
      allConnections: [toolConnection],
    });

    expect(result).toEqual({
      context: { result: { text: "Handled the NonRetriableError and finished." } },
    });
  });

  test("no tool call: behaves as a plain single-shot call and returns the model's final text", async () => {
    currentModel = makeSequencedModel([textResult("Just a plain answer.")]);

    const agentNode = makeAgentNode();
    const getExecutor = (): NodeExecutor => () => {
      throw new Error("getExecutor should not be called when there are no tools connected");
    };

    const result = await AgentExecutor({
      data: agentNode.data as AgentNodeData,
      nodeId: "agent-1",
      userId: "test-user",
      context: { existing: "value" },
      step: fakeStep,
      getExecutor,
      allNodes: [agentNode],
      allConnections: [],
    });

    expect(result).toEqual({
      context: { existing: "value", result: { text: "Just a plain answer." } },
    });
  });
});

describe("AgentExecutor generation parameters", () => {
  test("passes temperature, maxOutputTokens, and a configured model through to generateText", async () => {
    let capturedCallOptions: Record<string, unknown> | undefined;
    currentModel = new MockLanguageModelV3({
      doGenerate: async (options) => {
        capturedCallOptions = options as unknown as Record<string, unknown>;
        return textResult("done") as never;
      },
    });

    const agentNode = makeAgentNode({ model: "gpt-4o", temperature: 0.3, maxTokens: 128 });

    await AgentExecutor({
      data: agentNode.data as AgentNodeData,
      nodeId: "agent-1",
      userId: "test-user",
      context: {},
      step: fakeStep,
      getExecutor: () => {
        throw new Error("not used");
      },
      allNodes: [agentNode],
      allConnections: [],
    });

    expect(capturedCallOptions?.temperature).toBe(0.3);
    expect(capturedCallOptions?.maxOutputTokens).toBe(128);
  });
});
