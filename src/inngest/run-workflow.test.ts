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

function makeFakePublish() {
  const calls: { nodeId: string; status: string }[] = [];
  const publish = async (
    message:
      | Promise<{ channel: string; topic: string; data: unknown }>
      | { channel: string; topic: string; data: unknown },
  ) => {
    const resolved = await message;
    const data = resolved.data as { nodeId: string; status: string };
    calls.push({ nodeId: data.nodeId, status: data.status });
  };
  return { publish: publish as unknown as Parameters<typeof runWorkflow>[0]["publish"], calls };
}

describe("runWorkflow", () => {
  test("executes a linear chain in order", async () => {
    const calls: string[] = [];
    const nodes = [makeNode("a", "MANUAL_TRIGGER"), makeNode("b", "HTTP_REQUEST")];
    const connections = [makeConnection("a", "b", "a-source")];
    const { publish } = makeFakePublish();

    await runWorkflow({
      nodes,
      connections,
      initialData: {},
      step: fakeStep,
      userId: "test-user",
      workflowID: "workflow-1",
      publish,
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
    const { publish } = makeFakePublish();

    await runWorkflow({
      nodes,
      connections,
      initialData: {},
      step: fakeStep,
      userId: "test-user",
      workflowID: "workflow-1",
      publish,
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
    const { publish } = makeFakePublish();

    await runWorkflow({
      nodes,
      connections,
      initialData: {},
      step: fakeStep,
      userId: "test-user",
      workflowID: "workflow-1",
      publish,
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
    const { publish } = makeFakePublish();

    await runWorkflow({
      nodes,
      connections,
      initialData: {},
      step: fakeStep,
      userId: "test-user",
      workflowID: "workflow-1",
      publish,
      getExecutor: getExecutor as never,
    });

    expect(calls).toEqual(["if", "trueBranch", "merge"]);
    expect(calls.filter((id) => id === "merge")).toHaveLength(1);
  });

  test("rejects a workflow that contains a cycle", async () => {
    const nodes = [makeNode("a", "HTTP_REQUEST"), makeNode("b", "HTTP_REQUEST")];
    const connections = [makeConnection("a", "b"), makeConnection("b", "a")];
    const { publish } = makeFakePublish();

    await expect(
      runWorkflow({
        nodes,
        connections,
        initialData: {},
        step: fakeStep,
        userId: "test-user",
        workflowID: "workflow-1",
        publish,
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
    const { publish } = makeFakePublish();

    await runWorkflow({
      nodes,
      connections,
      initialData: {},
      step: fakeStep,
      userId: "owner-user-id",
      workflowID: "workflow-1",
      publish,
      getExecutor,
    });

    expect(seenUserIds).toEqual(["owner-user-id"]);
  });

  test("publishes loading then success for a node that completes normally", async () => {
    const { publish, calls } = makeFakePublish();
    const nodes = [makeNode("a", "HTTP_REQUEST")];
    const connections: Connection[] = [];

    await runWorkflow({
      nodes,
      connections,
      initialData: {},
      step: fakeStep,
      userId: "test-user",
      workflowID: "workflow-1",
      publish,
      getExecutor: () => passthroughExecutor([]),
    });

    expect(calls).toEqual([
      { nodeId: "a", status: "loading" },
      { nodeId: "a", status: "success" },
    ]);
  });

  test("publishes loading then error for a node that throws, and still propagates the error", async () => {
    const { publish, calls } = makeFakePublish();
    const nodes = [makeNode("a", "HTTP_REQUEST")];
    const connections: Connection[] = [];

    const throwingExecutor: NodeExecutor = async () => {
      throw new Error("boom");
    };

    await expect(
      runWorkflow({
        nodes,
        connections,
        initialData: {},
        step: fakeStep,
        userId: "test-user",
        workflowID: "workflow-1",
        publish,
        getExecutor: () => throwingExecutor,
      }),
    ).rejects.toThrow("boom");

    expect(calls).toEqual([
      { nodeId: "a", status: "loading" },
      { nodeId: "a", status: "error" },
    ]);
  });

  test("never publishes for a node on the untaken branch", async () => {
    const { publish, calls } = makeFakePublish();
    const nodes = [
      makeNode("if", "IF"),
      makeNode("trueBranch", "HTTP_REQUEST"),
      makeNode("falseBranch", "HTTP_REQUEST"),
    ];
    const connections = [
      makeConnection("if", "trueBranch", "if-true-source"),
      makeConnection("if", "falseBranch", "if-false-source"),
    ];

    const getExecutor = (type: string): NodeExecutor =>
      type === "IF"
        ? async ({ context }) => ({ context, branch: "true" })
        : passthroughExecutor([]);

    await runWorkflow({
      nodes,
      connections,
      initialData: {},
      step: fakeStep,
      userId: "test-user",
      workflowID: "workflow-1",
      publish,
      getExecutor: getExecutor as never,
    });

    const nodeIds = calls.map((c) => c.nodeId);
    expect(nodeIds).not.toContain("falseBranch");
  });
});
