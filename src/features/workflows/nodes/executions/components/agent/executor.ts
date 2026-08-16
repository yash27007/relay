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
    case "OPENAI":
      return createOpenAI({ apiKey })("gpt-4o-mini");
    case "ANTHROPIC":
      return createAnthropic({ apiKey })("claude-sonnet-5");
    case "GEMINI":
      return createGoogleGenerativeAI({ apiKey })("gemini-2.0-flash");
    case "GROQ":
      return createGroq({ apiKey })("llama-3.3-70b-versatile");
    default:
      // AIProviderType is the CredentialType Prisma enum — every member is
      // handled explicitly above. A default that silently fell through to
      // one provider's SDK would risk sending a *different* provider's
      // decrypted API key to the wrong one if the enum ever grows a member
      // without a matching case here.
      throw new NonRetriableError(`Agent node: Unsupported model provider "${provider}"`);
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
              // Falling back to the whole `result.context` here would leak
              // every prior node's output (plus this call's own $fromAI
              // args) to the model provider whenever the tool's variable
              // resolves to null/undefined — unreachable today (HTTP
              // Request always writes its variable, and discoverToolNodes
              // already requires one), but a real footgun for future
              // tool-capable node types. Fall back to an explicit,
              // information-free error instead.
              return toolVariableName
                ? (result.context[toolVariableName] ?? { error: "Tool produced no output" })
                : { error: "Tool produced no output" };
            } catch (error) {
              // A tool's own config validation failure (e.g. HTTP Request's
              // "No endpoint configured") is a NonRetriableError the SAME
              // way it would be if this node ran in the main flow — no
              // amount of the model retrying with different $fromAI args
              // will ever fix a static misconfiguration, so let it abort
              // the run like every other node's validation does, rather
              // than becoming a {error} result the model would burn
              // maxSteps retrying against something that can never
              // succeed. Only a tool's *runtime* failure (a bad argument,
              // a transient API error) is domain information the model can
              // usefully react to — that's the case this catch still
              // handles, and it's the one deliberate departure from every
              // other node's fail-the-whole-run convention (see the plan's
              // Global Constraints).
              if (error instanceof NonRetriableError) {
                throw error;
              }
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
