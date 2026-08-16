import ky from "ky";
import type { ModelOption } from "./types";

export async function listOllamaModels(
  baseUrl: string,
  apiKey: string | null,
): Promise<ModelOption[]> {
  const response = await ky
    .get(`${baseUrl.replace(/\/$/, "")}/api/tags`, {
      headers: apiKey ? { Authorization: `Bearer ${apiKey}` } : undefined,
    })
    .json<{ models: { name: string }[] }>();

  return response.models.map((model) => ({ id: model.name }));
}
