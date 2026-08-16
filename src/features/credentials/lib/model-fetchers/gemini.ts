import ky from "ky";
import type { ModelOption } from "./types";

export async function listGeminiModels(apiKey: string): Promise<ModelOption[]> {
  const response = await ky
    .get("https://generativelanguage.googleapis.com/v1beta/models", {
      searchParams: { key: apiKey },
    })
    .json<{
      models: { name: string; displayName?: string; supportedGenerationMethods?: string[] }[];
    }>();

  return response.models
    .filter((model) => model.supportedGenerationMethods?.includes("generateContent"))
    .map((model) => ({
      // Gemini's `name` is "models/gemini-2.0-flash" — every other
      // provider (and the AI SDK's model-id argument) wants the bare id.
      id: model.name.replace(/^models\//, ""),
      label: model.displayName,
    }));
}
