import type { CredentialType } from "@/generated/prisma/enums";
import { decrypt } from "@/lib/encryption";
import { listAnthropicModels } from "./anthropic";
import { listDeepseekModels } from "./deepseek";
import { listGeminiModels } from "./gemini";
import { listGroqModels } from "./groq";
import { listMistralModels } from "./mistral";
import { listMoonshotModels } from "./moonshot";
import { listOllamaModels } from "./ollama";
import { listOpenAiModels } from "./openai";
import type { ModelOption } from "./types";

export interface CredentialRow {
  value: string | null;
  config: unknown;
}

function requireApiKey(credential: CredentialRow, providerLabel: string): string {
  if (!credential.value) {
    throw new Error(`${providerLabel} credential has no stored API key`);
  }
  return decrypt(credential.value);
}

function requireOllamaBaseUrl(credential: CredentialRow): string {
  const config = credential.config as { baseUrl?: string } | null;
  if (!config?.baseUrl) {
    throw new Error("Ollama credential is missing a base URL");
  }
  return config.baseUrl;
}

// Each entry is declared `async` (rather than a plain arrow returning the
// fetcher's promise) so that a synchronous throw from `requireApiKey` /
// `requireOllamaBaseUrl` — evaluated as an argument before the fetcher is
// ever called — becomes a rejected promise instead of an exception thrown
// synchronously out of `modelFetchers[type](credential)`. Callers (the
// tRPC procedure, this file's own tests) rely on being able to `await` or
// `.catch()` failures uniformly.
export const modelFetchers: Record<
  CredentialType,
  (credential: CredentialRow) => Promise<ModelOption[]>
> = {
  OPENAI: async (credential) => listOpenAiModels(requireApiKey(credential, "OpenAI")),
  GROQ: async (credential) => listGroqModels(requireApiKey(credential, "Groq")),
  DEEPSEEK: async (credential) => listDeepseekModels(requireApiKey(credential, "DeepSeek")),
  MISTRAL: async (credential) => listMistralModels(requireApiKey(credential, "Mistral")),
  MOONSHOT: async (credential) => listMoonshotModels(requireApiKey(credential, "Moonshot")),
  ANTHROPIC: async (credential) => listAnthropicModels(requireApiKey(credential, "Anthropic")),
  GEMINI: async (credential) => listGeminiModels(requireApiKey(credential, "Gemini")),
  OLLAMA: async (credential) =>
    listOllamaModels(
      requireOllamaBaseUrl(credential),
      credential.value ? decrypt(credential.value) : null,
    ),
};
