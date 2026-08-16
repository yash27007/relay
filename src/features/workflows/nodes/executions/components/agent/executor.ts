import { NonRetriableError } from "inngest";
import { createAnthropic } from "@ai-sdk/anthropic";
import { createGroq } from "@ai-sdk/groq";
import { createOpenAI } from "@ai-sdk/openai";
import { createGoogleGenerativeAI } from "@ai-sdk/google";
import { generateText, stepCountIs, tool, type LanguageModel } from "ai";
import { prisma } from "@/lib/db";
import { decrypt } from "@/lib/encryption";
import type { AIProviderType } from "@/features/credentials/lib/ai-providers";
import type { NodeExecutor, StepTools } from "../../types";
import { resolveTemplate } from "../../lib/resolve-template";
import { buildToolInputSchema } from "./tool-schema";
import { discoverToolNodes } from "./discover-tools";
import type { AgentNodeData } from "./types";

function createModel(provider: AIProviderType, apiKey: string): LanguageModel {
  switch (provider) {
    case "ANTHROPIC":
      return createAnthropic({ apiKey })("claude-sonnet-5");
    case "GEMINI":
      return createGoogleGenerativeAI({ apiKey })("gemini-2.0-flash");
    case "GROQ":
      return createGroq({ apiKey })("llama-3.3-70b-versatile");
    default:
      return createOpenAI({ apiKey })("gpt-4o-mini");
  }
}

// A tool node's own executor calls step.run(...) internally (e.g.
// HttpRequestExecutor). Calling that from inside another step.run's
// callback is illegal (Inngest doesn't support nested steps) — and since
// the model's choice of which tools to call isn't deterministic, treating
// each tool call as its OWN independently-memoized Inngest step risks a
// retry replaying a stale result against a differently-parameterized call.
// This passthrough sidesteps both problems: it satisfies StepTools'
// shape enough for a tool node's own `step.run(name, fn)` calls to work,
// but never registers anything with Inngest — the underlying work (e.g.
// the HTTP request) runs for real, every time, non-memoized. Cost: an
// individual tool call isn't independently retried by Inngest on transient
// failure — ky (used by HttpRequestExecutor) retries transient failures by
// default, and a persistently failing call becomes an error result the
// model can react to (see the try/catch below), not a fatal abort.
const passthroughStep = {
  run: async <T>(_name: string, fn: () => Promise<T>) => fn(),
} as unknown as StepTools;

export const AgentExecutor: NodeExecutor<AgentNodeData> = async ({
  data,
  nodeId,
  userId,
  context,
  step,
  getExecutor,
  allNodes,
  allConnections,
}) => {
  if (!data.variableName) {
    throw new NonRetriableError("Agent node: Variable name is required");
  }
  if (!data.provider) {
    throw new NonRetriableError("Agent node: Model provider is required");
  }
  if (!data.credentialId) {
    throw new NonRetriableError("Agent node: Credential is required");
  }
  if (!data.userPrompt) {
    throw new NonRetriableError("Agent node: User prompt is required");
  }

  const variableName = data.variableName;
  const provider = data.provider;
  const credentialId = data.credentialId;
  const maxSteps = Math.min(Math.max(data.maxSteps ?? 5, 1), 15);
  const systemPrompt = data.systemPrompt
    ? String(resolveTemplate(data.systemPrompt, context) ?? "")
    : undefined;
  const userPrompt = String(resolveTemplate(data.userPrompt, context) ?? "");

  const toolNodes = discoverToolNodes(nodeId, allNodes, allConnections);

  const credential = await step.run(`agent-get-credential-${nodeId}`, () =>
    prisma.credential.findFirst({
      where: { id: credentialId, userId, type: provider },
      select: { value: true },
    }),
  );

  if (!credential) {
    throw new NonRetriableError("Agent node: Credential not found");
  }

  const text = await step.run(`agent-run-${nodeId}`, async () => {
    let apiKey: string;
    try {
      apiKey = decrypt(credential.value);
    } catch {
      throw new NonRetriableError("Agent node: Credential could not be decrypted");
    }

    const model = createModel(provider, apiKey);

    const tools = Object.fromEntries(
      toolNodes.map(({ node: toolNode, aiTool }) => [
        toolNode.id,
        tool({
          description: aiTool.description,
          inputSchema: buildToolInputSchema(aiTool.parameters),
          execute: async (input) => {
            const toolExecutor = getExecutor(toolNode.type);
            const toolContext = { ...context, $fromAI: input as Record<string, unknown> };
            try {
              const result = await toolExecutor({
                data: toolNode.data as Record<string, unknown>,
                nodeId: toolNode.id,
                context: toolContext,
                step: passthroughStep,
                userId,
                getExecutor,
                allNodes,
                allConnections,
              });
              const toolVariableName = (toolNode.data as { variableName?: string }).variableName;
              return toolVariableName
                ? (result.context[toolVariableName] ?? result.context)
                : result.context;
            } catch (error) {
              // A tool failure is domain information for the model, not a
              // workflow-execution failure — it can retry with different
              // arguments, try something else, or explain the failure in
              // its final answer. Deliberately differs from every other
              // node's fail-the-whole-run convention (see the plan's
              // Global Constraints).
              return { error: error instanceof Error ? error.message : String(error) };
            }
          },
        }),
      ]),
    );

    const result = await generateText({
      model,
      system: systemPrompt,
      prompt: userPrompt,
      tools,
      stopWhen: stepCountIs(maxSteps),
    });
    return result.text;
  });

  return {
    context: {
      ...context,
      [variableName]: { text },
    },
  };
};
