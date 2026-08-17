import { fetchOpenAiCompatibleModels } from "./openai-compatible";

export const listDeepseekModels = (apiKey: string) =>
  fetchOpenAiCompatibleModels("https://api.deepseek.com/v1", apiKey);
