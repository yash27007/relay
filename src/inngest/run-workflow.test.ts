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

function makeConnection(
  fromNodeId: string,
  toNodeId: string,
  fromOutput = "main",
  toInput = "main",
): Connection {
  return {
    id: `${fromNodeId}->${toNodeId}:${fromOutput}`,
    workflowId: "workflow-1",
    fromNodeId,
    toNodeId,
    fromOutput,
    toInput,
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

function makeFakeRecordStep() {
  const calls: {
    nodeId: string;
    nodeName: string;
    nodeType: string;
    status: string;
    error?: string;
  }[] = [];
  const recordStep = async (event: {
    nodeId: string;
    nodeName: string;
    nodeType: string;
    status: "loading" | "success" | "error";
    error?: string;
  }) => {
    calls.push(event);
  };
  return { recordStep: recordStep as Parameters<typeof runWorkflow>[0]["recordStep"], calls };
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

  test("calls recordStep with loading then success for each executed node", async () => {
    const calls: string[] = [];
    const nodes = [makeNode("a", "MANUAL_TRIGGER"), makeNode("b", "HTTP_REQUEST")];
    const connections = [makeConnection("a", "b", "a-source")];
    const { publish } = makeFakePublish();
    const { recordStep, calls: stepCalls } = makeFakeRecordStep();

    await runWorkflow({
      nodes,
      connections,
      initialData: {},
      step: fakeStep,
      userId: "test-user",
      workflowID: "workflow-1",
      publish,
      recordStep,
      getExecutor: () => passthroughExecutor(calls),
    });

    expect(stepCalls).toEqual([
      { nodeId: "a", nodeName: "MANUAL_TRIGGER", nodeType: "MANUAL_TRIGGER", status: "loading" },
      { nodeId: "a", nodeName: "MANUAL_TRIGGER", nodeType: "MANUAL_TRIGGER", status: "success" },
      { nodeId: "b", nodeName: "HTTP_REQUEST", nodeType: "HTTP_REQUEST", status: "loading" },
      { nodeId: "b", nodeName: "HTTP_REQUEST", nodeType: "HTTP_REQUEST", status: "success" },
    ]);
  });

  test("calls recordStep with an error event and still rethrows when an executor throws", async () => {
    const nodes = [makeNode("a", "MANUAL_TRIGGER")];
    const connections: ReturnType<typeof makeConnection>[] = [];
    const { publish } = makeFakePublish();
    const { recordStep, calls: stepCalls } = makeFakeRecordStep();
    const failingExecutor: NodeExecutor = async () => {
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
        recordStep,
        getExecutor: () => failingExecutor,
      }),
    ).rejects.toThrow("boom");

    expect(stepCalls).toEqual([
      { nodeId: "a", nodeName: "MANUAL_TRIGGER", nodeType: "MANUAL_TRIGGER", status: "loading" },
      { nodeId: "a", nodeName: "MANUAL_TRIGGER", nodeType: "MANUAL_TRIGGER", status: "error", error: "boom" },
    ]);
  });

  test("recordStep is optional — omitting it changes nothing about execution", async () => {
    const calls: string[] = [];
    const nodes = [makeNode("a", "MANUAL_TRIGGER")];
    const { publish } = makeFakePublish();

    await runWorkflow({
      nodes,
      connections: [],
      initialData: {},
      step: fakeStep,
      userId: "test-user",
      workflowID: "workflow-1",
      publish,
      getExecutor: () => passthroughExecutor(calls),
    });

    expect(calls).toEqual(["a"]);
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

  test("passes getExecutor, allNodes, and allConnections through to every executor call", async () => {
    const nodes = [makeNode("a", "HTTP_REQUEST"), makeNode("b", "HTTP_REQUEST")];
    const connections = [makeConnection("a", "b", "a-source")];
    const seen: {
      getExecutorIsFunction: boolean;
      allNodesLength: number;
      allConnectionsLength: number;
    }[] = [];

    const getExecutor = (): NodeExecutor =>
      async ({ context, getExecutor: seenGetExecutor, allNodes, allConnections }) => {
        seen.push({
          getExecutorIsFunction: typeof seenGetExecutor === "function",
          allNodesLength: allNodes.length,
          allConnectionsLength: allConnections.length,
        });
        return { context };
      };
    const { publish } = makeFakePublish();

    await runWorkflow({
      nodes,
      connections,
      initialData: {},
      step: fakeStep,
      userId: "test-user",
      workflowID: "workflow-1",
      publish,
      getExecutor,
    });

    expect(seen).toEqual([
      { getExecutorIsFunction: true, allNodesLength: 2, allConnectionsLength: 1 },
      { getExecutorIsFunction: true, allNodesLength: 2, allConnectionsLength: 1 },
    ]);
  });

  test("a node connected only as a tool never executes via the main loop", async () => {
    const calls: string[] = [];
    const nodes = [makeNode("agent", "AGENT"), makeNode("tool", "HTTP_REQUEST")];
    const connections = [makeConnection("tool", "agent", "tool-tool-source", "agent-tool-target")];
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

    expect(calls).toEqual([]);
  });

  test("a tool connection never appears in the flow ordering or branch routing", async () => {
    const calls: string[] = [];
    const nodes = [
      makeNode("trigger", "MANUAL_TRIGGER"),
      makeNode("agent", "AGENT"),
      makeNode("tool", "HTTP_REQUEST"),
    ];
    const connections = [
      makeConnection("trigger", "agent", "trigger-source"),
      makeConnection("tool", "agent", "tool-tool-source", "agent-tool-target"),
    ];
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

    expect(calls).toEqual(["trigger", "agent"]);
  });
});
