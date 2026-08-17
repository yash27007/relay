import { fetchOpenAiCompatibleModels } from "./openai-compatible";

export const listMistralModels = (apiKey: string) =>
  fetchOpenAiCompatibleModels("https://api.mistral.ai/v1", apiKey);
