# Live Execution Status Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make the already-built-but-unused `NodeStatusIndicator`/node `status` prop reflect a real, live Inngest workflow run — nodes light up loading/success/error on the canvas as execution proceeds.

**Architecture:** `@inngest/realtime`'s middleware injects a `publish` function onto the Inngest function handler's context. `runWorkflow`'s existing single execution loop wraps every executor call with `publish("loading")` → run → `publish("success"|"error")` on one per-workflow realtime channel — no executor file changes needed. The client subscribes to that channel via `useInngestSubscription` while the editor is open and merges incoming `{nodeId, status}` messages into React Flow node data; 5 node components read that instead of a hardcoded `"initial"` literal.

**Tech Stack:** `@inngest/realtime@0.4.7` (already installed, version-matched to `inngest@3.49.1`), existing tRPC/TanStack Query stack.

**Spec:** `docs/superpowers/specs/2026-08-16-live-execution-status-design.md`

## Global Constraints

- `NodeExecutorParams`, `NodeExecutor` signatures, and all 8 existing executor files are unchanged by this plan — publishing is centralized in `runWorkflow`, not per-executor.
- A thrown error's existing retry/failure behavior is unchanged — publishing `"error"` happens on the way out of a `catch` that re-throws, never swallows an error.
- The realtime subscription token endpoint must verify workflow ownership (`userId: ctx.auth.user.id`) before issuing a token, matching the existing `execute` procedure's ownership-check pattern in the same router.
- New tests use `bun test` (`describe`/`test`/`expect` from `"bun:test"`).

---

### Task 1: Inngest realtime middleware + channel definition

**Files:**
- Modify: `src/inngest/client.ts` (full file)
- Create: `src/inngest/channels/workflow-run.ts`

**Interfaces:**
- Produces: `workflowRunChannel(workflowID: string)` — a channel with one `status` topic (`{nodeId: string; status: "loading" | "success" | "error"}`), consumed by Task 2 (`run-workflow.ts`) and Task 4 (the tRPC token endpoint).

- [ ] **Step 1: Add the realtime middleware to the Inngest client**

Replace the full contents of `src/inngest/client.ts` with:

```ts
import { Inngest } from "inngest";
import { realtimeMiddleware } from "@inngest/realtime/middleware";

export const inngest = new Inngest({
  id: "relay",
  middleware: [realtimeMiddleware()],
});
```

- [ ] **Step 2: Create the channel definition**

Create `src/inngest/channels/workflow-run.ts`:

```ts
import { channel, topic } from "@inngest/realtime";
import { z } from "zod";

/**
 * One channel per workflow, carrying per-node execution status as a
 * workflow runs. Subscribed to by the editor while it's open; published to
 * by runWorkflow's execution loop (see run-workflow.ts) — no executor
 * publishes to this directly.
 */
export const workflowRunChannel = channel(
  (workflowID: string) => `workflow-run:${workflowID}`,
).addTopic(
  topic("status").schema(
    z.object({
      nodeId: z.string(),
      status: z.enum(["loading", "success", "error"]),
    }),
  ),
);
```

- [ ] **Step 3: Typecheck**

Run: `bunx tsc --noEmit`
Expected: no new errors beyond the 8 pre-existing ones in `src/app/page.tsx`/`src/components/ui/resizable.tsx`.

- [ ] **Step 4: Commit**

```bash
git add src/inngest/client.ts src/inngest/channels/workflow-run.ts
git commit -m "feat: add Inngest realtime middleware and per-workflow status channel"
```

---

### Task 2: `runWorkflow` publishes status around every executor call

**Files:**
- Modify: `src/inngest/run-workflow.ts` (full file)
- Modify: `src/inngest/run-workflow.test.ts` (extend existing tests + add new ones)

**Interfaces:**
- Consumes: `workflowRunChannel` from Task 1.
- Produces: `RunWorkflowParams` gains `workflowID: string` and `publish: Realtime.PublishFn` (type from `@inngest/realtime`'s `types.js`, re-exported as `Realtime` — import as `import type { Realtime } from "@inngest/realtime";`), consumed by Task 3 (`function.ts`).

- [ ] **Step 1: Write the failing tests**

Add these test cases to `src/inngest/run-workflow.test.ts` (keep all existing tests; extend the file). First, add a fake publish helper near the top, alongside `fakeStep`:

```ts
function makeFakePublish() {
  const calls: { nodeId: string; status: string }[] = [];
  const publish = async (message: { channel: string; topic: string; data: unknown }) => {
    const data = message.data as { nodeId: string; status: string };
    calls.push({ nodeId: data.nodeId, status: data.status });
  };
  return { publish: publish as unknown as Parameters<typeof runWorkflow>[0]["publish"], calls };
}
```

Then add these tests inside the existing `describe("runWorkflow", ...)` block (every existing `runWorkflow({...})` call in the file also needs `workflowID: "workflow-1"` and a `publish` added — see Step 2 below for updating those):

```ts
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
```

- [ ] **Step 2: Update every existing `runWorkflow({...})` call site in the test file**

Every existing test in this file calls `runWorkflow({...})` — each needs `workflowID: "workflow-1"` and `publish` added (use `makeFakePublish().publish`, or a fresh `const { publish } = makeFakePublish();` per test if you don't need to assert on its calls). Add both fields to all 7 pre-existing `runWorkflow({...})` call sites (the ones from `executes a linear chain in order`, `only executes nodes on the taken branch of an IF node`, `nothing downstream executes when the taken branch has no connection`, `a node downstream of both branches executes exactly once (fan-in)`, `rejects a workflow that contains a cycle`, and `passes the trusted userId through to every executor call`).

- [ ] **Step 3: Run tests to verify they fail**

Run: `bun test src/inngest/run-workflow.test.ts`
Expected: FAIL — `runWorkflow` doesn't accept `workflowID`/`publish` yet, and the new assertions have nothing to check against.

- [ ] **Step 4: Implement**

Replace the full contents of `src/inngest/run-workflow.ts` with:

```ts
import type { Connection, Node } from "@/generated/prisma/client";
import type { NodeType } from "@/generated/prisma/enums";
import type { Realtime } from "@inngest/realtime";
import type {
  NodeExecutor,
  StepTools,
  WorkflowContext,
} from "@/features/workflows/nodes/executions/types";
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

  const ch = workflowRunChannel(workflowID);
  const publishStatus = (nodeId: string, status: "loading" | "success" | "error") =>
    publish(ch.status({ nodeId, status }));

  let context = initialData;

  for (const node of sortedNodes) {
    if (!reachable.has(node.id)) continue;

    const executor = getExecutor(node.type as NodeType);

    await publishStatus(node.id, "loading");
    let result: Awaited<ReturnType<NodeExecutor>>;
    try {
      result = await executor({
        data: node.data as Record<string, unknown>,
        nodeId: node.id,
        context,
        step,
        userId,
      });
    } catch (error) {
      await publishStatus(node.id, "error");
      throw error;
    }
    await publishStatus(node.id, "success");

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
```

- [ ] **Step 5: Run tests to verify they pass**

Run: `bun test src/inngest/run-workflow.test.ts`
Expected: PASS (9 tests: the original 6 plus the 3 new ones)

- [ ] **Step 6: Typecheck**

Run: `bunx tsc --noEmit`
Expected: no new errors. If `Realtime.PublishFn`'s exact type doesn't line up cleanly with what the test's `makeFakePublish` casts to, that's expected — the cast (`as unknown as Parameters<typeof runWorkflow>[0]["publish"]`) is there specifically to sidestep needing to construct a fully-typed real publish function in tests, matching how `fakeStep` already does the same thing for `StepTools`.

- [ ] **Step 7: Commit**

```bash
git add src/inngest/run-workflow.ts src/inngest/run-workflow.test.ts
git commit -m "feat: publish loading/success/error status around every executor call"
```

---

### Task 3: Wire `function.ts` to pass `publish` and `workflowID`

**Files:**
- Modify: `src/inngest/function.ts` (full file)

**Interfaces:**
- Consumes: `RunWorkflowParams`'s new `workflowID`/`publish` fields from Task 2.

- [ ] **Step 1: Replace the file**

Replace the full contents of `src/inngest/function.ts` with:

```ts
import { NonRetriableError } from "inngest";
import { inngest } from "./client";
import { prisma } from "@/lib/db";
import { runWorkflow } from "./run-workflow";
import { getExecutor } from "@/features/workflows/nodes/executions/lib/executor-registry";
import type { Connection, Node } from "@/generated/prisma/client";

export const executeWorkflow = inngest.createFunction(
  { id: "execute-workflow" },
  { event: "workflows/execute.workflow" },
  async ({ event, step, publish }) => {
    const workflowID = event.data.workflowID;
    if (!workflowID) {
      throw new NonRetriableError("Workflow ID is missing");
    }

    const workflow = await step.run("prepare-workflow", async () => {
      return prisma.workflow.findUniqueOrThrow({
        where: { id: workflowID },
        include: { nodes: true, connections: true },
      });
    });

    const result = await runWorkflow({
      // step.run's return type is Jsonify<T>, which turns Date fields into
      // strings even though the runtime value is a real Date on first run.
      // runWorkflow/topologicalSort/executors never read createdAt/updatedAt,
      // so this cast is safe — it only reconciles the type, not the behavior.
      nodes: workflow.nodes as unknown as Node[],
      connections: workflow.connections as unknown as Connection[],
      initialData: event.data.initialData || {},
      step,
      getExecutor,
      // The trusted owner id — loaded from the DB above, never from
      // node/event data. Executors that fetch a saved credential (e.g. an
      // AI provider API key) scope that lookup by this, not anything
      // workflow-author-controlled.
      userId: workflow.userId,
      workflowID,
      publish,
    });

    return {
      workflowID,
      result,
    };
  },
);
```

The only changes from before: `publish` added to the destructured handler params (available because Task 1's middleware injects it), and `workflowID`/`publish` passed into `runWorkflow`.

- [ ] **Step 2: Typecheck**

Run: `bunx tsc --noEmit`
Expected: no new errors. If TypeScript complains that `publish` isn't a known property on the handler's destructured params, the realtime middleware's context-injection may need an explicit type assertion — if so, cast narrowly: `async ({ event, step, publish }: { event: ...; step: StepTools; publish: Realtime.PublishFn })` is a last resort; try without it first, since the middleware is typed to inject this automatically.

- [ ] **Step 3: Commit**

```bash
git add src/inngest/function.ts
git commit -m "feat: pass publish and workflowID from the Inngest function into runWorkflow"
```

---

### Task 4: `workflows.getRealtimeToken` tRPC procedure

**Files:**
- Modify: `src/features/workflows/server/index.ts`

**Interfaces:**
- Consumes: `workflowRunChannel` from Task 1, `inngest` client from Task 1's modified `client.ts`.
- Produces: `workflows.getRealtimeToken` query, consumed by Task 5's frontend hook.

- [ ] **Step 1: Add the procedure**

In `src/features/workflows/server/index.ts`, add these imports near the top (alongside the existing ones):

```ts
import { getSubscriptionToken } from "@inngest/realtime";
import { workflowRunChannel } from "@/inngest/channels/workflow-run";
```

Then add this procedure to the `workflowsRouter` object, alongside the existing `execute` procedure (same file, same router — place it directly after `execute`):

```ts
  getRealtimeToken: protectedProcedure
    .input(z.object({ id: z.string() }))
    .query(async ({ ctx, input }) => {
      // Same ownership check as `execute` — never issue a subscription
      // token for a workflow the caller doesn't own.
      await ctx.prisma.workflow.findFirstOrThrow({
        where: {
          id: input.id,
          userId: ctx.auth.user.id,
        },
      });

      return getSubscriptionToken(inngest, {
        channel: workflowRunChannel(input.id),
        topics: ["status"],
      });
    }),
```

- [ ] **Step 2: Typecheck**

Run: `bunx tsc --noEmit`
Expected: no new errors.

- [ ] **Step 3: Commit**

```bash
git add src/features/workflows/server/index.ts
git commit -m "feat: add workflows.getRealtimeToken procedure"
```

---

### Task 5: Frontend subscription hook + Editor wiring

**Files:**
- Create: `src/features/workflows/hooks/use-workflow-execution-status.ts`
- Modify: `src/features/workflows/editor/components/editor.tsx`
- Modify: `src/features/workflows/nodes/execute-workflow.tsx`

**Interfaces:**
- Consumes: `workflows.getRealtimeToken` from Task 4.
- Produces: `useWorkflowExecutionStatus(workflowID): {nodeId: string; status: "loading"|"success"|"error"}[]`, consumed by `Editor`.

- [ ] **Step 1: Create the hook**

Create `src/features/workflows/hooks/use-workflow-execution-status.ts`:

```ts
"use client";
import { useQueryClient } from "@tanstack/react-query";
import { useInngestSubscription } from "@inngest/realtime/hooks";
import { useTRPC } from "@/trpc/client";

export type NodeExecutionStatus = "loading" | "success" | "error";

export interface NodeStatusMessage {
  nodeId: string;
  status: NodeExecutionStatus;
}

/**
 * Subscribes to a workflow's live execution status while mounted. Returns
 * only messages that arrived since the last render (freshData) — Editor
 * applies each one to its local node state as it arrives.
 */
export const useWorkflowExecutionStatus = (workflowID: string): NodeStatusMessage[] => {
  const trpc = useTRPC();
  const queryClient = useQueryClient();

  const fetchToken = () =>
    queryClient.fetchQuery(trpc.workflows.getRealtimeToken.queryOptions({ id: workflowID }));

  const { freshData } = useInngestSubscription({
    token: fetchToken,
    refreshToken: fetchToken,
    enabled: true,
  });

  return (freshData ?? []) as unknown as NodeStatusMessage[];
};
```

- [ ] **Step 2: Wire the hook into `Editor`**

In `src/features/workflows/editor/components/editor.tsx`, add this import:

```ts
import { useWorkflowExecutionStatus } from "@/features/workflows/hooks/use-workflow-execution-status";
```

Add this inside the `Editor` component, after the existing `useAutosave(...)` call:

```ts
  const statusMessages = useWorkflowExecutionStatus(workflowID);
  useEffect(() => {
    if (statusMessages.length === 0) return;
    setNodes((currentNodes) => {
      const statusByNodeId = new Map(statusMessages.map((m) => [m.nodeId, m.status]));
      return currentNodes.map((node) =>
        statusByNodeId.has(node.id)
          ? { ...node, data: { ...node.data, status: statusByNodeId.get(node.id) } }
          : node,
      );
    });
  }, [statusMessages]);

  const handleExecuteStart = useCallback(() => {
    setNodes((currentNodes) =>
      currentNodes.map((node) => ({ ...node, data: { ...node.data, status: "initial" } })),
    );
  }, []);
```

Then change the `ExecuteWorkflowButton` usage near the bottom of the component from:

```tsx
        {hasManualTrigger && (
          <Panel position="bottom-center">
            <ExecuteWorkflowButton workflowID={workflowID} />
          </Panel>
        )}
```

to:

```tsx
        {hasManualTrigger && (
          <Panel position="bottom-center">
            <ExecuteWorkflowButton workflowID={workflowID} onExecuteStart={handleExecuteStart} />
          </Panel>
        )}
```

- [ ] **Step 3: Add the `onExecuteStart` prop to `ExecuteWorkflowButton`**

Replace the full contents of `src/features/workflows/nodes/execute-workflow.tsx` with:

```tsx
import { Button } from "@/components/ui/button";
import { FlaskConicalIcon } from "lucide-react";
import { useExecuteWorkflow } from "../hooks/use-workflows";

interface Props {
  workflowID: string;
  onExecuteStart?: () => void;
}

export const ExecuteWorkflowButton = ({ workflowID, onExecuteStart }: Props) => {
  const executeWorkflow = useExecuteWorkflow();
  const handleExecute = () => {
    onExecuteStart?.();
    executeWorkflow.mutate({ id: workflowID });
  };
  return (
    <Button size="lg" disabled={executeWorkflow.isPending} onClick={handleExecute}>
      <FlaskConicalIcon className="size-4" />
      Execute Workflow
    </Button>
  );
};
```

- [ ] **Step 4: Typecheck**

Run: `bunx tsc --noEmit`
Expected: no new errors. If `useInngestSubscription`'s generic token type doesn't infer cleanly against what `queryClient.fetchQuery(...)` returns (a real possibility — this is the one genuinely uncertain type-integration point in this plan, since `@inngest/realtime`'s token type and tRPC's superjson-transported return type weren't designed with each other in mind), the pragmatic fix is a narrow cast on `fetchToken`'s return value rather than fighting the generics — e.g. wrap the `queryClient.fetchQuery(...)` call's result with `as Parameters<typeof useInngestSubscription>[0]["token"]` at the call site. Don't spend more than a few minutes on this before reaching for the cast; document why with a one-line comment if you do.

- [ ] **Step 5: Commit**

```bash
git add src/features/workflows/hooks/use-workflow-execution-status.ts src/features/workflows/editor/components/editor.tsx src/features/workflows/nodes/execute-workflow.tsx
git commit -m "feat: subscribe the editor to live execution status"
```

---

### Task 6: Node components read live status instead of a hardcoded literal

**Files:**
- Modify: `src/features/workflows/nodes/executions/components/if/if-node.tsx`
- Modify: `src/features/workflows/nodes/executions/components/switch/switch-node.tsx`
- Modify: `src/features/workflows/nodes/executions/components/http-request/http-request-node.tsx`
- Modify: `src/features/workflows/nodes/triggers/components/manual-trigger/manual-trigger.tsx`
- Modify: `src/features/workflows/nodes/executions/components/ai/ai-node.tsx`

**Interfaces:**
- Consumes: `node.data.status` as written by Task 5's `Editor` (a `"loading" | "success" | "error" | "initial" | undefined` string).

Every file in this task has the same one-line change: replace a hardcoded `const nodeStatus = "initial"` with a read from `props.data`, falling back to `"initial"` when absent (covers both a freshly-added node and any node type not yet touched by a run). The exact variable name and surrounding code differs slightly per file — locate the line, don't assume identical surrounding context.

- [ ] **Step 1: `if-node.tsx`**

Find `const nodeStatus = "initial"` in `src/features/workflows/nodes/executions/components/if/if-node.tsx` and replace with:

```ts
  const nodeStatus = (props.data?.status as NodeStatus) ?? "initial";
```

Add this import at the top of the file:

```ts
import type { NodeStatus } from "../../../react-flow/status-indicator";
```

- [ ] **Step 2: `switch-node.tsx`**

Same change in `src/features/workflows/nodes/executions/components/switch/switch-node.tsx`: find `const nodeStatus = "initial"`, replace with the same `props.data?.status` read, add the same `NodeStatus` import (adjust the relative path if this file's directory depth differs — it's a sibling of `if/`, so the same `../../../react-flow/status-indicator` path applies).

- [ ] **Step 3: `http-request-node.tsx`**

Same change in `src/features/workflows/nodes/executions/components/http-request/http-request-node.tsx`.

- [ ] **Step 4: `manual-trigger.tsx`**

Same change in `src/features/workflows/nodes/triggers/components/manual-trigger/manual-trigger.tsx` — same depth as `if-node.tsx` relative to `nodes/` (3 directories deep: `triggers/components/manual-trigger/` vs. `executions/components/if/`), so the same import applies verbatim:

```ts
import type { NodeStatus } from "../../../react-flow/status-indicator";
```

(Confirmed against this file's existing `import { BaseTriggerNode } from "../base-trigger-node"` — `base-trigger-node.tsx` lives directly under `triggers/components/`, one level up from `manual-trigger/`, which checks out at this same depth.)

- [ ] **Step 5: `ai-node.tsx`**

In `src/features/workflows/nodes/executions/components/ai/ai-node.tsx`, find `const nodeStatus = "initial";` inside the `AiNode` component body created by `createAiNode`, replace with:

```ts
    const nodeStatus = (props.data?.status as NodeStatus) ?? "initial";
```

Add the import: `import type { NodeStatus } from "../../../react-flow/status-indicator";` — this file is at `executions/components/ai/`, the same depth as `if/`/`switch/`/`http-request/` relative to `nodes/` (confirmed against this file's existing `import { BaseExecutionNode } from "../base-execution-node"`, where `base-execution-node.tsx` lives directly under `executions/components/`).

- [ ] **Step 6: Typecheck and remove stale TODO comments**

Run: `bunx tsc --noEmit` — fix any import path mistakes from Steps 1-5 now (expected to need 1-2 corrections; the exact relative paths above are worked out by hand, verify don't assume).

Then, in each of these 8 executor files, delete the now-resolved comments (they no longer describe pending work — status publishing is centralized in `runWorkflow`, done in Task 2):
- `src/features/workflows/nodes/triggers/components/manual-trigger/executor.ts`: remove `// TODO PUBLISH loading state for manual trigger` and `// TODO Publish success State for maual trigger`
- `src/features/workflows/nodes/executions/components/http-request/executor.ts`: remove the same two comments
- (`if/executor.ts`, `switch/executor.ts`, and the 4 AI executors never had these TODO comments — no change needed there)

- [ ] **Step 7: Run full test suite**

Run: `bun test`
Expected: all tests passing (no test in this codebase covers node-component rendering, so this just confirms nothing else broke).

- [ ] **Step 8: Commit**

```bash
git add src/features/workflows/nodes/executions/components/if/if-node.tsx src/features/workflows/nodes/executions/components/switch/switch-node.tsx src/features/workflows/nodes/executions/components/http-request/http-request-node.tsx src/features/workflows/nodes/triggers/components/manual-trigger/manual-trigger.tsx src/features/workflows/nodes/executions/components/ai/ai-node.tsx src/features/workflows/nodes/triggers/components/manual-trigger/executor.ts src/features/workflows/nodes/executions/components/http-request/executor.ts
git commit -m "feat: node components render live execution status instead of a hardcoded literal"
```

---

### Task 7: End-to-end verification

**Files:** none (verification only)

- [ ] **Step 1: Full automated verification**

Run: `bun test && bunx tsc --noEmit`
Expected: all tests passing, typecheck clean except the 8 pre-existing unrelated errors.

- [ ] **Step 2: Manual smoke test**

No browser is available in this sandbox (same limitation noted in the original IF-node plan) — this step is for whoever runs this plan in an environment with one, or for the user to do themselves afterward:

1. `bun run dev:all`
2. Open a workflow with a Manual Trigger, an HTTP Request node pointed at a real reachable URL, and (optional) an IF node branching to two more HTTP nodes.
3. Click Execute Workflow.
4. Confirm: node borders visibly change (loading → success/error) roughly in execution order as the run proceeds, an untaken IF branch's nodes never light up at all, and clicking Execute again first clears all statuses back to initial before the new run's messages start arriving.

- [ ] **Step 3: Commit** (only if Step 2 uncovered a fix)

If manual verification found nothing to fix, there's nothing to commit for this task.

---

## Explicitly out of scope for this plan

- Persisted execution history (the dead `/executions` page, an `Execution`/`NodeExecution` Prisma model) — separate design pass.
- Per-node output-data viewer — separate design pass.
- Connection-state UI (live/reconnecting indicator for the realtime subscription itself).
- Any change to `NodeExecutorParams`, executor signatures, or error/retry semantics beyond adding a status message on the way out of a thrown error.
