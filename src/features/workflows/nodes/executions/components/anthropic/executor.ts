import { createAnthropic } from "@ai-sdk/anthropic";
import { createAiExecutor } from "../ai/create-ai-executor";

export const AnthropicExecutor = createAiExecutor({
  providerType: "ANTHROPIC",
  providerLabel: "Anthropic",
  defaultModel: "claude-sonnet-5",
  createModel: (apiKey, model) => createAnthropic({ apiKey })(model),
});
