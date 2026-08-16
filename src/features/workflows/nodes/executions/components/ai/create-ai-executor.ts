import type { LanguageModel } from "ai";
import { generateText, Output } from "ai";
import { NonRetriableError } from "inngest";
import { prisma } from "@/lib/db";
import { decrypt } from "@/lib/encryption";
import type { AIProviderType } from "@/features/credentials/lib/ai-providers";
import type { NodeExecutor } from "../../types";
import { resolveTemplate } from "../../lib/resolve-template";
import type { AiNodeData } from "./types";

interface CreateAiExecutorOptions {
  providerType: AIProviderType;
  providerLabel: string;
  /** Used when a node predates this feature and has no `data.model`. */
  defaultModel: string;
  createModel: (apiKey: string, model: string) => LanguageModel;
}

/**
 * Builds a NodeExecutor for an AI-provider node. All single-shot
 * providers share this exact shape — resolve prompts, look up the user's
 * saved credential for this provider, decrypt it, call `generateText`
 * once with the node's chosen model/temperature/maxTokens/JSON-mode —
 * differing only in which SDK/model factory `createModel` wires up.
 */
export function createAiExecutor({
  providerType,
  providerLabel,
  defaultModel,
  createModel,
}: CreateAiExecutorOptions): NodeExecutor<AiNodeData> {
  const slug = providerType.toLowerCase();

  return async ({ data, nodeId, userId, context, step }) => {
    if (!data.variableName) {
      throw new NonRetriableError(`${providerLabel} node: Variable name is required`);
    }
    if (!data.credentialId) {
      throw new NonRetriableError(`${providerLabel} node: Credential is required`);
    }
    if (!data.userPrompt) {
      throw new NonRetriableError(`${providerLabel} node: User prompt is required`);
    }

    const variableName = data.variableName;
    const credentialId = data.credentialId;
    const systemPrompt = data.systemPrompt
      ? String(resolveTemplate(data.systemPrompt, context) ?? "")
      : undefined;
    const userPrompt = String(resolveTemplate(data.userPrompt, context) ?? "");

    const credential = await step.run(`${slug}-get-credential-${nodeId}`, () =>
      prisma.credential.findFirst({
        where: { id: credentialId, userId, type: providerType },
        select: { value: true },
      }),
    );

    if (!credential) {
      throw new NonRetriableError(`${providerLabel} node: Credential not found`);
    }
    if (!credential.value) {
      throw new NonRetriableError(`${providerLabel} node: Credential has no stored key`);
    }

    const text = await step.run(`${slug}-generate-${nodeId}`, async () => {
      let apiKey: string;
      try {
        apiKey = decrypt(credential.value as string);
      } catch {
        throw new NonRetriableError(
          `${providerLabel} node: Credential could not be decrypted`,
        );
      }

      const model = createModel(apiKey, data.model || defaultModel);
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
}
