import { fetchOpenAiCompatibleModels } from "./openai-compatible";

export const listMoonshotModels = (apiKey: string) =>
  fetchOpenAiCompatibleModels("https://api.moonshot.ai/v1", apiKey);
