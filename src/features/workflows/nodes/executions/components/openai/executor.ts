import { createOpenAI } from "@ai-sdk/openai";
import { createAiExecutor } from "../ai/create-ai-executor";

export const OpenAiExecutor = createAiExecutor({
  providerType: "OPENAI",
  providerLabel: "OpenAI",
  defaultModel: "gpt-4o-mini",
  createModel: (apiKey, model) => createOpenAI({ apiKey })(model),
});
