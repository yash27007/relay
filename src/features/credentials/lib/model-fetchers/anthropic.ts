import ky from "ky";
import type { ModelOption } from "./types";

export async function listAnthropicModels(apiKey: string): Promise<ModelOption[]> {
  const response = await ky
    .get("https://api.anthropic.com/v1/models", {
      headers: { "x-api-key": apiKey, "anthropic-version": "2023-06-01" },
    })
    .json<{ data: { id: string; display_name?: string }[] }>();

  return response.data.map((model) => ({ id: model.id, label: model.display_name }));
}
