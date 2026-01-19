import { Connection, Node } from "@/generated/prisma/client";
import toposort from "toposort";

export const topologicalSort = (
  nodes: Node[],
  connections: Connection[],
): Node[] => {
  // if no connections, return node as is ( they are all independent)
  if (connections.length === 0) return nodes;
  // create edges for toposort

  const edges: [string, string][] = connections.map((connection) => [
    connection.fromNodeId,
    connection.toNodeId,
  ]);

  //  Add nodes with no connections as self-edges to ensure they're included

  const connectedNodeIds = new Set<string>();
  for (const connection of connections) {
    connectedNodeIds.add(connection.fromNodeId);
    connectedNodeIds.add(connection.toNodeId);
  }

  for (const node of nodes) {
    if (!connectedNodeIds.has(node.id)) {
      edges.push([node.id, node.id]);
    }
  }

  // Perform topological sort

  let sortedNodeIds: string[];

  try {
    sortedNodeIds = toposort(edges);
    // Remove duplicates from self edges
    sortedNodeIds = [...new Set(sortedNodeIds)];
  } catch (error) {
    if (error instanceof Error && error.message.includes("Cyclic")) {
      throw new Error("Workflow contains a cycle");
    }

    throw error;
  }

  const nodeMap = new Map(nodes.map((n) => [n.id, n]));
  return sortedNodeIds.map((id)=> nodeMap.get(id)!).filter(Boolean)
};
