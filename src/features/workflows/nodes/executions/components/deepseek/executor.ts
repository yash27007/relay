import { createDeepSeek } from "@ai-sdk/deepseek";
import { createAiExecutor } from "../ai/create-ai-executor";

export const DeepseekExecutor = createAiExecutor({
  providerType: "DEEPSEEK",
  providerLabel: "DeepSeek",
  defaultModel: "deepseek-chat",
  createModel: (apiKey, model) => createDeepSeek({ apiKey })(model),
});
