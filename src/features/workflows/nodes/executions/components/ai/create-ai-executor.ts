import type { LanguageModel } from "ai";
import { generateText } from "ai";
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
  createModel: (apiKey: string) => LanguageModel;
}

/**
 * Builds a NodeExecutor for an AI-provider node. All four providers
 * (OpenAI/Anthropic/Gemini/Groq) share this exact shape — resolve prompts,
 * look up the user's saved credential for this provider, decrypt it, call
 * the model — differing only in which SDK/model createModel wires up. Each
 * provider's executor.ts is a ~5-line call to this factory.
 */
export function createAiExecutor({
  providerType,
  providerLabel,
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

    // Split into two steps (fetch, then generate) rather than one: a
    // transient generateText failure retries without re-hitting Prisma.
    // select: {value} only — this step's return value is memoized into
    // Inngest's persisted run history, so the row's other fields (name,
    // userId, timestamps) have no reason to be in that log.
    const credential = await step.run(`${slug}-get-credential-${nodeId}`, () =>
      prisma.credential.findFirst({
        where: { id: credentialId, userId, type: providerType },
        select: { value: true },
      }),
    );

    if (!credential) {
      throw new NonRetriableError(`${providerLabel} node: Credential not found`);
    }

    const text = await step.run(`${slug}-generate-${nodeId}`, async () => {
      let apiKey: string;
      try {
        apiKey = decrypt(credential.value);
      } catch {
        throw new NonRetriableError(
          `${providerLabel} node: Credential could not be decrypted`,
        );
      }

      const model = createModel(apiKey);
      const result = await generateText({
        model,
        system: systemPrompt,
        prompt: userPrompt,
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
