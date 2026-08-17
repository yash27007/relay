import type { Connection, Node } from "@/generated/prisma/client";
import type { NodeType } from "@/generated/prisma/enums";
import type { Realtime } from "@inngest/realtime";
import type {
  NodeExecutor,
  StepTools,
  WorkflowContext,
} from "@/features/workflows/nodes/executions/types";
import { isToolConnection } from "@/features/workflows/nodes/executions/lib/tool-connections";
import { diffContext } from "./lib/diff-context";
import { workflowRunChannel } from "./channels/workflow-run";
import { topologicalSort } from "./utils";

export interface RunWorkflowParams {
  nodes: Node[];
  connections: Connection[];
  initialData: WorkflowContext;
  step: StepTools;
  getExecutor: (type: NodeType) => NodeExecutor;
  /** The workflow owner's id — see NodeExecutorParams.userId for the trust contract. */
  userId: string;
  workflowID: string;
  /** Injected by @inngest/realtime's middleware onto the function handler's context. */
  publish: Realtime.PublishFn;
  /**
   * Optional persistence hook — records this run's execution history.
   * Left undefined by every existing test/call site that doesn't need it
   * (a no-op then). The real implementation (src/inngest/function.ts)
   * writes to WorkflowRunStep and is responsible for never throwing —
   * this file stays free of Prisma/DB concerns entirely, and a
   * bookkeeping failure must never be allowed to change what a run's
   * actual outcome was.
   *
   * `input`/`output` are only ever passed on the "success"/"error"
   * transitions — the "loading" transition has neither yet, and passing
   * `input` there would be redundant with the same node's later
   * success/error row, which `upsert` overwrites anyway. `output` is
   * only ever present on "success" (an error means the executor never
   * returned a result to diff).
   */
  recordStep?: (event: {
    nodeId: string;
    nodeName: string;
    nodeType: string;
    status: "loading" | "success" | "error";
    error?: string;
    input?: WorkflowContext;
    output?: WorkflowContext;
  }) => Promise<void>;
}

export async function runWorkflow({
  nodes,
  connections,
  initialData,
  step,
  getExecutor,
  userId,
  workflowID,
  publish,
  recordStep,
}: RunWorkflowParams): Promise<WorkflowContext> {
  // Tool connections (an Agent node calling another node as a tool) are
  // metadata for the Agent's own executor to discover, not part of the
  // linear execution graph — excluded here so a tool-only node (no flow
  // connection at all) is never treated as a "root" node and auto-executed
  // by the main loop in addition to being callable as a tool.
  // Note that `hasInbound` below is deliberately computed from ALL
  // connections, not just `flowConnections`: it means "has ANY inbound
  // connection, tool or flow", not just "has a flow inbound". So a node
  // that would otherwise have been a flow root (no flow-connection parent)
  // but is ALSO the target of a tool connection — e.g. an Agent node with
  // tools wired into it — is intentionally excluded from being
  // auto-executed as a root purely because it has that tool-connection
  // inbound. This is deliberate, not a bug.
  const flowConnections = connections.filter((connection) => !isToolConnection(connection));
  const toolNodeIds = new Set(
    connections.filter(isToolConnection).map((connection) => connection.fromNodeId),
  );

  const sortedNodes = topologicalSort(nodes, flowConnections);

  const outputsByNode = new Map<string, Connection[]>();
  for (const connection of flowConnections) {
    const list = outputsByNode.get(connection.fromNodeId) ?? [];
    list.push(connection);
    outputsByNode.set(connection.fromNodeId, list);
  }

  const hasInbound = new Set(connections.map((connection) => connection.toNodeId));
  const reachable = new Set(
    sortedNodes
      .filter((node) => !hasInbound.has(node.id) && !toolNodeIds.has(node.id))
      .map((node) => node.id),
  );

  const ch = workflowRunChannel(workflowID);
  const publishStatus = (nodeId: string, status: "loading" | "success" | "error") =>
    publish(ch.status({ nodeId, status }));
  const recordNodeStatus = (
    node: Node,
    status: "loading" | "success" | "error",
    options?: { error?: string; input?: WorkflowContext; output?: WorkflowContext },
  ) =>
    recordStep?.({
      nodeId: node.id,
      nodeName: node.name,
      nodeType: node.type,
      status,
      error: options?.error,
      input: options?.input,
      output: options?.output,
    }) ?? Promise.resolve();

  let context = initialData;

  for (const node of sortedNodes) {
    if (!reachable.has(node.id)) continue;

    const executor = getExecutor(node.type as NodeType);
    const input = context;

    await publishStatus(node.id, "loading");
    await recordNodeStatus(node, "loading").catch(() => {});
    let result: Awaited<ReturnType<NodeExecutor>>;
    try {
      result = await executor({
        data: node.data as Record<string, unknown>,
        nodeId: node.id,
        context,
        step,
        userId,
        getExecutor,
        allNodes: nodes,
        allConnections: connections,
      });
    } catch (error) {
      // Each publish call the middleware wraps in its own durable `step.run`
      // (we're outside a step here), so it can itself throw after exhausting
      // retries. Swallow that failure — best effort only — so a broken
      // status publish never masks the executor's real error, which is what
      // the run must actually fail with.
      await publishStatus(node.id, "error").catch(() => {});
      await recordNodeStatus(node, "error", {
        error: error instanceof Error ? error.message : String(error),
        input,
      }).catch(() => {});
      throw error;
    }
    await publishStatus(node.id, "success");
    // diffContext can throw (e.g. a circular reference or BigInt anywhere
    // in the context makes its internal JSON.stringify throw). That must
    // never surface as this node's — or this run's — actual outcome, so
    // it's computed outside recordNodeStatus's own `.catch`: an object
    // literal's properties are evaluated before the call they're an
    // argument to, so a throw here would happen before recordNodeStatus
    // is even invoked and bypass that guard entirely. Fall back to
    // `undefined` (not `{}`) — "we couldn't compute this" rather than a
    // false claim that nothing changed.
    let output: WorkflowContext | undefined;
    try {
      output = diffContext(input, result.context);
    } catch {
      output = undefined;
    }
    await recordNodeStatus(node, "success", { input, output }).catch(() => {});

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
