import { createAnthropic } from "@ai-sdk/anthropic";
import { createAiExecutor } from "../ai/create-ai-executor";

export const AnthropicExecutor = createAiExecutor({
  providerType: "ANTHROPIC",
  providerLabel: "Anthropic",
  createModel: (apiKey) => createAnthropic({ apiKey })("claude-3-5-sonnet-latest"),
});
