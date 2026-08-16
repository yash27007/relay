import { createGroq } from "@ai-sdk/groq";
import { createAiExecutor } from "../ai/create-ai-executor";

export const GroqExecutor = createAiExecutor({
  providerType: "GROQ",
  providerLabel: "Groq",
  defaultModel: "llama-3.3-70b-versatile",
  createModel: (apiKey, model) => createGroq({ apiKey })(model),
});
