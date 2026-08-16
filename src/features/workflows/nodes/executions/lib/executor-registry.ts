import { NodeType } from "@/generated/prisma/enums";
import { NodeExecutor } from "../types";
import { manualTriggerExecutor } from "../../triggers/components/manual-trigger/executor";
import { HttpRequestExecutor } from "../components/http-request/executor";
import { IfExecutor } from "../components/if/executor";
import { SwitchExecutor } from "../components/switch/executor";
import { OpenAiExecutor } from "../components/openai/executor";
import { AnthropicExecutor } from "../components/anthropic/executor";
import { GeminiExecutor } from "../components/gemini/executor";
import { GroqExecutor } from "../components/groq/executor";
import { AgentExecutor } from "../components/agent/executor";
import { DeepseekExecutor } from "../components/deepseek/executor";
import { MistralExecutor } from "../components/mistral/executor";
import { MoonshotExecutor } from "../components/moonshot/executor";

export const executorRegistry: Record<NodeType, NodeExecutor> = {
  [NodeType.MANUAL_TRIGGER]: manualTriggerExecutor,
  [NodeType.INITIAL]: manualTriggerExecutor,
  [NodeType.HTTP_REQUEST]: HttpRequestExecutor,
  [NodeType.IF]: IfExecutor,
  [NodeType.SWITCH]: SwitchExecutor,
  [NodeType.OPENAI]: OpenAiExecutor,
  [NodeType.ANTHROPIC]: AnthropicExecutor,
  [NodeType.GEMINI]: GeminiExecutor,
  [NodeType.GROQ]: GroqExecutor,
  [NodeType.AGENT]: AgentExecutor,
  [NodeType.DEEPSEEK]: DeepseekExecutor,
  [NodeType.MISTRAL]: MistralExecutor,
  [NodeType.MOONSHOT]: MoonshotExecutor,
};

export const getExecutor = (type: NodeType): NodeExecutor => {
  const executor = executorRegistry[type];
  if (!executor) {
    throw new Error(`No executor found for node type: ${type}`);
  }
  return executor;
};
