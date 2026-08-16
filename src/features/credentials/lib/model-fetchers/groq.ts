import { fetchOpenAiCompatibleModels } from "./openai-compatible";

export const listGroqModels = (apiKey: string) =>
  fetchOpenAiCompatibleModels("https://api.groq.com/openai/v1", apiKey);
