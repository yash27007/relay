import type { Edge, Node } from "@xyflow/react";

export interface AncestorVariable {
  nodeId: string;
  nodeType: string;
  variableName: string;
}

/**
 * Walks backward from `nodeId` following incoming flow connections
 * (excluding tool connections, whose `targetHandle` ends in
 * `-tool-target` — the same convention `isToolConnection` encodes
 * server-side against Connection.toInput, applied here against
 * Edge.targetHandle) to find every ancestor node that has a configured
 * `variableName` — the variables `{{...}}` expressions on `nodeId` can
 * actually reference. Nodes without a `variableName` (triggers, IF,
 * Switch) don't produce a referenceable variable and are skipped from
 * the results, but their own ancestors are still walked.
 */
export function findAncestorVariables(
  nodes: Node[],
  edges: Edge[],
  nodeId: string,
): AncestorVariable[] {
  const nodesById = new Map(nodes.map((node) => [node.id, node]));
  const visited = new Set<string>();
  const results: AncestorVariable[] = [];
  const queue: string[] = [nodeId];

  while (queue.length > 0) {
    const currentId = queue.shift() as string;
    const incomingEdges = edges.filter(
      (edge) => edge.target === currentId && !edge.targetHandle?.endsWith("-tool-target"),
    );
    for (const edge of incomingEdges) {
      if (visited.has(edge.source)) continue;
      visited.add(edge.source);
      queue.push(edge.source);

      const sourceNode = nodesById.get(edge.source);
      const variableName = (sourceNode?.data as { variableName?: string } | undefined)
        ?.variableName;
      if (sourceNode && variableName) {
        results.push({
          nodeId: sourceNode.id,
          nodeType: sourceNode.type ?? "",
          variableName,
        });
      }
    }
  }

  return results;
}
