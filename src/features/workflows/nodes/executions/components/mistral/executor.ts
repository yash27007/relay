import { createMistral } from "@ai-sdk/mistral";
import { createAiExecutor } from "../ai/create-ai-executor";

export const MistralExecutor = createAiExecutor({
  providerType: "MISTRAL",
  providerLabel: "Mistral",
  defaultModel: "mistral-large-latest",
  createModel: (apiKey, model) => createMistral({ apiKey })(model),
});
