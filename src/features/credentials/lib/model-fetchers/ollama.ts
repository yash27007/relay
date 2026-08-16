import ky from "ky";
import { resolveOllamaApiBaseUrl } from "../ollama-base-url";
import type { ModelOption } from "./types";

export async function listOllamaModels(
  baseUrl: string,
  apiKey: string | null,
): Promise<ModelOption[]> {
  const response = await ky
    .get(`${resolveOllamaApiBaseUrl(baseUrl)}/tags`, {
      headers: apiKey ? { Authorization: `Bearer ${apiKey}` } : undefined,
    })
    .json<{ models: { name: string }[] }>();

  return response.models.map((model) => ({ id: model.name }));
}
