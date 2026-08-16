import { describe, expect, test } from "bun:test";
import type { Connection, Node } from "@/generated/prisma/client";
import type { NodeExecutor } from "@/features/workflows/nodes/executions/types";
import { runWorkflow } from "./run-workflow";

const fakeStep = {
  run: async <T>(_name: string, fn: () => Promise<T>) => fn(),
} as unknown as Parameters<typeof runWorkflow>[0]["step"];

function makeNode(id: string, type: string, data: Record<string, unknown> = {}): Node {
  return {
    id,
    workflowId: "workflow-1",
    name: type,
    type: type as Node["type"],
    position: { x: 0, y: 0 },
    data,
    createdAt: new Date(),
    updatedAt: new Date(),
  } as unknown as Node;
}

function makeConnection(fromNodeId: string, toNodeId: string, fromOutput = "main"): Connection {
  return {
    id: `${fromNodeId}->${toNodeId}:${fromOutput}`,
    workflowId: "workflow-1",
    fromNodeId,
    toNodeId,
    fromOutput,
    toInput: "main",
    createdAt: new Date(),
    updatedAt: new Date(),
  } as unknown as Connection;
}

function passthroughExecutor(calls: string[]): NodeExecutor {
  return async ({ nodeId, context }) => {
    calls.push(nodeId);
    return { context };
  };
}

describe("runWorkflow", () => {
  test("executes a linear chain in order", async () => {
    const calls: string[] = [];
    const nodes = [makeNode("a", "MANUAL_TRIGGER"), makeNode("b", "HTTP_REQUEST")];
    const connections = [makeConnection("a", "b", "a-source")];

    await runWorkflow({
      nodes,
      connections,
      initialData: {},
      step: fakeStep,
      userId: "test-user",
      getExecutor: () => passthroughExecutor(calls),
    });

    expect(calls).toEqual(["a", "b"]);
  });

  test("only executes nodes on the taken branch of an IF node", async () => {
    const calls: string[] = [];
    const nodes = [
      makeNode("trigger", "MANUAL_TRIGGER"),
      makeNode("if", "IF"),
      makeNode("trueBranch", "HTTP_REQUEST"),
      makeNode("falseBranch", "HTTP_REQUEST"),
    ];
    const connections = [
      makeConnection("trigger", "if", "trigger-source"),
      makeConnection("if", "trueBranch", "if-true-source"),
      makeConnection("if", "falseBranch", "if-false-source"),
    ];

    const getExecutor = (type: string): NodeExecutor =>
      type === "IF"
        ? async ({ nodeId, context }) => {
            calls.push(nodeId);
            return { context, branch: "true" };
          }
        : passthroughExecutor(calls);

    await runWorkflow({
      nodes,
      connections,
      initialData: {},
      step: fakeStep,
      userId: "test-user",
      getExecutor: getExecutor as never,
    });

    expect(calls).toEqual(["trigger", "if", "trueBranch"]);
  });

  test("nothing downstream executes when the taken branch has no connection", async () => {
    const calls: string[] = [];
    const nodes = [makeNode("if", "IF"), makeNode("trueBranch", "HTTP_REQUEST")];
    const connections = [makeConnection("if", "trueBranch", "if-true-source")];

    const getExecutor = (type: string): NodeExecutor =>
      type === "IF"
        ? async ({ nodeId, context }) => {
            calls.push(nodeId);
            return { context, branch: "false" };
          }
        : passthroughExecutor(calls);

    await runWorkflow({
      nodes,
      connections,
      initialData: {},
      step: fakeStep,
      userId: "test-user",
      getExecutor: getExecutor as never,
    });

    expect(calls).toEqual(["if"]);
  });

  test("a node downstream of both branches executes exactly once (fan-in)", async () => {
    const calls: string[] = [];
    const nodes = [
      makeNode("if", "IF"),
      makeNode("trueBranch", "HTTP_REQUEST"),
      makeNode("falseBranch", "HTTP_REQUEST"),
      makeNode("merge", "HTTP_REQUEST"),
    ];
    const connections = [
      makeConnection("if", "trueBranch", "if-true-source"),
      makeConnection("if", "falseBranch", "if-false-source"),
      makeConnection("trueBranch", "merge", "trueBranch-source"),
      makeConnection("falseBranch", "merge", "falseBranch-source"),
    ];

    const getExecutor = (type: string): NodeExecutor =>
      type === "IF"
        ? async ({ nodeId, context }) => {
            calls.push(nodeId);
            return { context, branch: "true" };
          }
        : passthroughExecutor(calls);

    await runWorkflow({
      nodes,
      connections,
      initialData: {},
      step: fakeStep,
      userId: "test-user",
      getExecutor: getExecutor as never,
    });

    expect(calls).toEqual(["if", "trueBranch", "merge"]);
    expect(calls.filter((id) => id === "merge")).toHaveLength(1);
  });

  test("rejects a workflow that contains a cycle", async () => {
    const nodes = [makeNode("a", "HTTP_REQUEST"), makeNode("b", "HTTP_REQUEST")];
    const connections = [makeConnection("a", "b"), makeConnection("b", "a")];

    await expect(
      runWorkflow({
        nodes,
        connections,
        initialData: {},
        step: fakeStep,
        userId: "test-user",
        getExecutor: () => passthroughExecutor([]),
      }),
    ).rejects.toThrow("Workflow contains a cycle");
  });

  test("passes the trusted userId through to every executor call", async () => {
    const seenUserIds: string[] = [];
    const nodes = [makeNode("a", "HTTP_REQUEST")];
    const connections: Connection[] = [];

    const getExecutor = (): NodeExecutor =>
      async ({ context, userId }) => {
        seenUserIds.push(userId);
        return { context };
      };

    await runWorkflow({
      nodes,
      connections,
      initialData: {},
      step: fakeStep,
      userId: "owner-user-id",
      getExecutor,
    });

    expect(seenUserIds).toEqual(["owner-user-id"]);
  });
});
