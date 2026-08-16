import { InitialNode } from "./initial-node";
import { NodeType } from "@/generated/prisma/enums";
import type { NodeTypes } from "@xyflow/react";
import { HttpRequestNode } from "./executions/components/http-request/http-request-node";
import { ManualTriggerNode } from "./triggers/components/manual-trigger/manual-trigger";
import { IfNode } from "./executions/components/if/if-node";

export const nodeComponents = {
  [NodeType.INITIAL]: InitialNode,
  [NodeType.HTTP_REQUEST]: HttpRequestNode,
  [NodeType.MANUAL_TRIGGER]: ManualTriggerNode,
  [NodeType.IF]: IfNode,
} as const satisfies NodeTypes;

export type RegisteredNodeType = keyof typeof nodeComponents;
