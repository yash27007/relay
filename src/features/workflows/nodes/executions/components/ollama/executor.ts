import { generateText, Output } from "ai";
import { NonRetriableError } from "inngest";
import { createOllama } from "ollama-ai-provider-v2";
import { resolveOllamaApiBaseUrl } from "@/features/credentials/lib/ollama-base-url";
import { prisma } from "@/lib/db";
import { decrypt } from "@/lib/encryption";
import type { NodeExecutor } from "../../types";
import { resolveTemplate } from "../../lib/resolve-template";
import type { AiNodeData } from "../ai/types";

const DEFAULT_MODEL = "llama3.2";

/**
 * Not built on createAiExecutor: Ollama's credential can legitimately
 * have no `value` (a local instance with no auth) and always needs
 * `config.baseUrl`, which the shared factory's signature has no room
 * for — see the plan's Task 11 rationale.
 */
export const OllamaExecutor: NodeExecutor<AiNodeData> = async ({
  data,
  nodeId,
  userId,
  context,
  step,
}) => {
  if (!data.variableName) {
    throw new NonRetriableError("Ollama node: Variable name is required");
  }
  if (!data.credentialId) {
    throw new NonRetriableError("Ollama node: Credential is required");
  }
  if (!data.userPrompt) {
    throw new NonRetriableError("Ollama node: User prompt is required");
  }

  const variableName = data.variableName;
  const credentialId = data.credentialId;
  const systemPrompt = data.systemPrompt
    ? String(resolveTemplate(data.systemPrompt, context) ?? "")
    : undefined;
  const userPrompt = String(resolveTemplate(data.userPrompt, context) ?? "");

  const credential = await step.run(`ollama-get-credential-${nodeId}`, () =>
    prisma.credential.findFirst({
      where: { id: credentialId, userId, type: "OLLAMA" },
      select: { value: true, config: true },
    }),
  );

  if (!credential) {
    throw new NonRetriableError("Ollama node: Credential not found");
  }

  const config = credential.config as { baseUrl?: string } | null;
  if (!config?.baseUrl) {
    throw new NonRetriableError("Ollama node: Credential is missing a base URL");
  }
  const baseUrl = config.baseUrl;

  const text = await step.run(`ollama-generate-${nodeId}`, async () => {
    let apiKey: string | undefined;
    if (credential.value) {
      try {
        apiKey = decrypt(credential.value);
      } catch {
        throw new NonRetriableError("Ollama node: Credential could not be decrypted");
      }
    }

    const ollama = createOllama({
      baseURL: resolveOllamaApiBaseUrl(baseUrl),
      headers: apiKey ? { Authorization: `Bearer ${apiKey}` } : undefined,
    });
    const model = ollama(data.model || DEFAULT_MODEL);

    const result = await generateText({
      model,
      system: systemPrompt,
      prompt: userPrompt,
      temperature: data.temperature,
      maxOutputTokens: data.maxTokens,
      output: data.jsonMode ? Output.json() : undefined,
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
