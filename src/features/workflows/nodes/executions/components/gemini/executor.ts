import { createGoogleGenerativeAI } from "@ai-sdk/google";
import { createAiExecutor } from "../ai/create-ai-executor";

export const GeminiExecutor = createAiExecutor({
  providerType: "GEMINI",
  providerLabel: "Gemini",
  defaultModel: "gemini-2.0-flash",
  createModel: (apiKey, model) => createGoogleGenerativeAI({ apiKey })(model),
});
