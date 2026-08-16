import ky from "ky";
import type { ModelOption } from "./types";

// Substrings of an OpenAI-compatible /v1/models response's `id` that mark
// a non-chat model (embeddings, audio, image, moderation) — these share
// the same models endpoint as chat models on OpenAI's API but can't be
// used as a generateText model.
const NON_CHAT_ID_SUBSTRINGS = ["embedding", "whisper", "tts", "dall-e", "moderation"];

/**
 * Lists models from any provider that implements OpenAI's `/v1/models`
 * response shape (`{ data: { id: string }[] }`) with Bearer-token auth —
 * covers OpenAI, Groq, DeepSeek, Mistral, and Moonshot/Kimi, all verified
 * OpenAI-compatible per their own API docs.
 */
export async function fetchOpenAiCompatibleModels(
  baseUrl: string,
  apiKey: string,
): Promise<ModelOption[]> {
  const response = await ky
    .get(`${baseUrl}/models`, { headers: { Authorization: `Bearer ${apiKey}` } })
    .json<{ data: { id: string }[] }>();

  return response.data
    .filter((model) => !NON_CHAT_ID_SUBSTRINGS.some((substring) => model.id.includes(substring)))
    .map((model) => ({ id: model.id }));
}
