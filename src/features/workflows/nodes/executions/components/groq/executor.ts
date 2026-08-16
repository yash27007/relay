import { createGroq } from "@ai-sdk/groq";
import { createAiExecutor } from "../ai/create-ai-executor";

export const GroqExecutor = createAiExecutor({
  providerType: "GROQ",
  providerLabel: "Groq",
  createModel: (apiKey) => createGroq({ apiKey })("llama-3.3-70b-versatile"),
});
