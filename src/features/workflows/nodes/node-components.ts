import { InitialNode } from "./initial-node";
import { NodeType } from "@/generated/prisma/enums";
import type { NodeTypes } from "@xyflow/react";
import { HttpRequestNode } from "./executions/components/http-request/http-request-node";
import { ManualTriggerNode } from "./triggers/components/manual-trigger/manual-trigger";
import { IfNode } from "./executions/components/if/if-node";
import { SwitchNode } from "./executions/components/switch/switch-node";
import { OpenAiNode } from "./executions/components/openai/node";
import { AnthropicNode } from "./executions/components/anthropic/node";
import { GeminiNode } from "./executions/components/gemini/node";
import { GroqNode } from "./executions/components/groq/node";

export const nodeComponents: Record<NodeType, NodeTypes[string]> = {
  [NodeType.INITIAL]: InitialNode,
  [NodeType.HTTP_REQUEST]: HttpRequestNode,
  [NodeType.MANUAL_TRIGGER]: ManualTriggerNode,
  [NodeType.IF]: IfNode,
  [NodeType.SWITCH]: SwitchNode,
  [NodeType.OPENAI]: OpenAiNode,
  [NodeType.ANTHROPIC]: AnthropicNode,
  [NodeType.GEMINI]: GeminiNode,
  [NodeType.GROQ]: GroqNode,
} satisfies NodeTypes;

export type RegisteredNodeType = keyof typeof nodeComponents;
