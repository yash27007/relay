import { fetchOpenAiCompatibleModels } from "./openai-compatible";

export const listOpenAiModels = (apiKey: string) =>
  fetchOpenAiCompatibleModels("https://api.openai.com/v1", apiKey);
