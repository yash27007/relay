import { NonRetriableError } from "inngest";
import type { Connection, Node } from "@/generated/prisma/client";
import type { AiToolConfig } from "../../lib/ai-tool";
import { toolTargetHandleId } from "../../lib/tool-connections";

export interface ValidatedToolNode {
  node: Node;
  aiTool: AiToolConfig;
}

/**
 * Finds every node connected into `agentNodeId`'s tool-target handle,
 * validates each has a complete "Use as AI Tool" configuration and a
 * variable name, and returns them ready for the Agent executor to build
 * `tool()` entries from. Throws NonRetriableError (fails the whole node,
 * matching every other executor's config-validation convention) for a
 * misconfigured or missing connected node — this happens before any model
 * call, so it's a configuration error, not a runtime tool-call error.
 */
export function discoverToolNodes(
  agentNodeId: string,
  allNodes: Node[],
  allConnections: Connection[],
): ValidatedToolNode[] {
  const targetHandle = toolTargetHandleId(agentNodeId);
  const toolNodeIds = allConnections
    .filter((connection) => connection.toInput === targetHandle)
    .map((connection) => connection.fromNodeId);

  const nodesById = new Map(allNodes.map((node) => [node.id, node]));

  return toolNodeIds.map((id) => {
    const node = nodesById.get(id);
    if (!node) {
      throw new NonRetriableError(`Agent node: connected tool node "${id}" not found`);
    }

    const data = node.data as { aiTool?: Partial<AiToolConfig>; variableName?: string };

    if (!data.aiTool?.description || !data.aiTool.parameters) {
      throw new NonRetriableError(
        `Agent node: "${node.name}" is connected as a tool but has no "Use as AI Tool" configuration`,
      );
    }
    if (!data.variableName) {
      throw new NonRetriableError(
        `Agent node: "${node.name}" is connected as a tool but has no variable name configured`,
      );
    }

    return {
      node,
      aiTool: { description: data.aiTool.description, parameters: data.aiTool.parameters },
    };
  });
}
