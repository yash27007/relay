import { createOpenAI } from "@ai-sdk/openai";
import { createAiExecutor } from "../ai/create-ai-executor";

export const OpenAiExecutor = createAiExecutor({
  providerType: "OPENAI",
  providerLabel: "OpenAI",
  createModel: (apiKey) => createOpenAI({ apiKey })("gpt-4o-mini"),
});
