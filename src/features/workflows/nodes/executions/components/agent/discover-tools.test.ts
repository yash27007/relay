import { describe, expect, test } from "bun:test";
import { NonRetriableError } from "inngest";
import type { Connection, Node } from "@/generated/prisma/client";
import { discoverToolNodes } from "./discover-tools";

function makeNode(id: string, data: Record<string, unknown> = {}, name = id): Node {
  return {
    id,
    workflowId: "workflow-1",
    name,
    type: "HTTP_REQUEST",
    position: { x: 0, y: 0 },
    data,
    createdAt: new Date(),
    updatedAt: new Date(),
  } as unknown as Node;
}

function makeConnection(fromNodeId: string, toNodeId: string, toInput: string): Connection {
  return {
    id: `${fromNodeId}->${toNodeId}`,
    workflowId: "workflow-1",
    fromNodeId,
    toNodeId,
    fromOutput: `${fromNodeId}-tool-source`,
    toInput,
    createdAt: new Date(),
    updatedAt: new Date(),
  } as unknown as Connection;
}

describe("discoverToolNodes", () => {
  test("returns an empty list when the agent has no tool connections", () => {
    const result = discoverToolNodes("agent-1", [makeNode("agent-1")], []);
    expect(result).toEqual([]);
  });

  test("finds a properly configured tool node", () => {
    const tool = makeNode("tool-1", {
      variableName: "weather",
      aiTool: { description: "Looks up weather", parameters: [] },
    });
    const nodes = [makeNode("agent-1"), tool];
    const connections = [makeConnection("tool-1", "agent-1", "agent-1-tool-target")];

    const result = discoverToolNodes("agent-1", nodes, connections);

    expect(result).toEqual([
      { node: tool, aiTool: { description: "Looks up weather", parameters: [] } },
    ]);
  });

  test("ignores connections into a different node's tool-target handle", () => {
    const nodes = [makeNode("agent-1"), makeNode("agent-2"), makeNode("tool-1", {
      variableName: "weather",
      aiTool: { description: "d", parameters: [] },
    })];
    const connections = [makeConnection("tool-1", "agent-2", "agent-2-tool-target")];

    const result = discoverToolNodes("agent-1", nodes, connections);
    expect(result).toEqual([]);
  });

  test("throws when a connected tool node has no aiTool configuration", () => {
    const nodes = [makeNode("agent-1"), makeNode("tool-1", { variableName: "weather" }, "My Tool")];
    const connections = [makeConnection("tool-1", "agent-1", "agent-1-tool-target")];

    expect(() => discoverToolNodes("agent-1", nodes, connections)).toThrow(NonRetriableError);
  });

  test("throws when a connected tool node has no variableName", () => {
    const nodes = [
      makeNode("agent-1"),
      makeNode("tool-1", { aiTool: { description: "d", parameters: [] } }, "My Tool"),
    ];
    const connections = [makeConnection("tool-1", "agent-1", "agent-1-tool-target")];

    expect(() => discoverToolNodes("agent-1", nodes, connections)).toThrow(NonRetriableError);
  });

  test("throws when a connected tool node id isn't in allNodes", () => {
    const nodes = [makeNode("agent-1")];
    const connections = [makeConnection("missing-node", "agent-1", "agent-1-tool-target")];

    expect(() => discoverToolNodes("agent-1", nodes, connections)).toThrow(NonRetriableError);
  });
});
