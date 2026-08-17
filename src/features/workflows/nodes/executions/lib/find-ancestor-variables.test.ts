import { describe, expect, test } from "bun:test";
import type { Edge, Node } from "@xyflow/react";
import { findAncestorVariables } from "./find-ancestor-variables";

function makeNode(id: string, type: string, variableName?: string): Node {
  return {
    id,
    type,
    position: { x: 0, y: 0 },
    data: variableName ? { variableName } : {},
  };
}

function makeEdge(source: string, target: string, targetHandle = "target"): Edge {
  return {
    id: `${source}->${target}`,
    source,
    target,
    sourceHandle: `${source}-source`,
    targetHandle,
  };
}

describe("findAncestorVariables", () => {
  test("linear chain: both ancestors with variableName are found", () => {
    const nodes = [
      makeNode("a", "HTTP_REQUEST", "myHttp"),
      makeNode("b", "OPENAI", "myAi"),
      makeNode("c", "IF"),
    ];
    const edges = [makeEdge("a", "b"), makeEdge("b", "c")];

    const result = findAncestorVariables(nodes, edges, "c");

    expect(result).toEqual([
      { nodeId: "b", nodeType: "OPENAI", variableName: "myAi" },
      { nodeId: "a", nodeType: "HTTP_REQUEST", variableName: "myHttp" },
    ]);
  });

  test("a node without variableName is skipped but its own ancestors still surface", () => {
    const nodes = [
      makeNode("trigger", "MANUAL_TRIGGER"),
      makeNode("branch", "IF"),
      makeNode("http", "HTTP_REQUEST", "myHttp"),
    ];
    const edges = [makeEdge("trigger", "branch"), makeEdge("branch", "http")];

    const result = findAncestorVariables(nodes, edges, "http");

    expect(result).toEqual([{ nodeId: "branch", nodeType: "IF", variableName: undefined }].filter(
      (entry) => entry.variableName,
    ));
  });

  test("a node with no ancestors returns an empty array", () => {
    const nodes = [makeNode("trigger", "MANUAL_TRIGGER")];
    const result = findAncestorVariables(nodes, [], "trigger");
    expect(result).toEqual([]);
  });

  test("fan-in (diamond) does not duplicate a shared ancestor", () => {
    const nodes = [
      makeNode("a", "HTTP_REQUEST", "myHttp"),
      makeNode("b", "OPENAI", "left"),
      makeNode("c", "ANTHROPIC", "right"),
      makeNode("d", "IF"),
    ];
    const edges = [
      makeEdge("a", "b"),
      makeEdge("a", "c"),
      makeEdge("b", "d"),
      makeEdge("c", "d"),
    ];

    const result = findAncestorVariables(nodes, edges, "d");
    const nodeIds = result.map((entry) => entry.nodeId).sort();

    expect(nodeIds).toEqual(["a", "b", "c"]);
  });

  test("tool connections (targetHandle ending in -tool-target) are not walked", () => {
    const nodes = [
      makeNode("tool", "HTTP_REQUEST", "toolResult"),
      makeNode("agent", "AGENT", "myAgent"),
    ];
    const edges = [makeEdge("tool", "agent", "agent-tool-target")];

    const result = findAncestorVariables(nodes, edges, "agent");

    expect(result).toEqual([]);
  });
});
