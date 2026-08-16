import type { Connection, Node } from "@/generated/prisma/client";
import type { NodeType } from "@/generated/prisma/enums";
import type {
  NodeExecutor,
  StepTools,
  WorkflowContext,
} from "@/features/workflows/nodes/executions/types";
import { topologicalSort } from "./utils";

export interface RunWorkflowParams {
  nodes: Node[];
  connections: Connection[];
  initialData: WorkflowContext;
  step: StepTools;
  getExecutor: (type: NodeType) => NodeExecutor;
}

export async function runWorkflow({
  nodes,
  connections,
  initialData,
  step,
  getExecutor,
}: RunWorkflowParams): Promise<WorkflowContext> {
  const sortedNodes = topologicalSort(nodes, connections);

  const outputsByNode = new Map<string, Connection[]>();
  for (const connection of connections) {
    const list = outputsByNode.get(connection.fromNodeId) ?? [];
    list.push(connection);
    outputsByNode.set(connection.fromNodeId, list);
  }

  const hasInbound = new Set(connections.map((connection) => connection.toNodeId));
  const reachable = new Set(
    sortedNodes.filter((node) => !hasInbound.has(node.id)).map((node) => node.id),
  );

  let context = initialData;

  for (const node of sortedNodes) {
    if (!reachable.has(node.id)) continue;

    const executor = getExecutor(node.type as NodeType);
    const result = await executor({
      data: node.data as Record<string, unknown>,
      nodeId: node.id,
      context,
      step,
    });
    context = result.context;

    const activeHandle = result.branch
      ? `${node.id}-${result.branch}-source`
      : undefined;

    for (const connection of outputsByNode.get(node.id) ?? []) {
      if (!activeHandle || connection.fromOutput === activeHandle) {
        reachable.add(connection.toNodeId);
      }
    }
  }

  return context;
}
