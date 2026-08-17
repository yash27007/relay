# Execution Inspector Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Capture per-node input/output data during workflow execution, surface it as a click-to-open drawer with canvas status badges, add a variable picker to every node dialog that accepts `{{template}}` expressions, and connect `/executions` to a read-only replay of the canvas for a past run.

**Architecture:** `WorkflowRunStep` gains `input`/`output` JSON columns, computed generically inside `runWorkflow`'s existing loop via a pure `diffContext` helper (no executor changes). `workflowsRouter.execute` creates the `WorkflowRun` row synchronously so the frontend knows the run's id immediately. A shared Jotai atom makes any node's status badge clickable without prop-threading through all 13 node components; a single drawer component reads that atom plus the known `runId` to show INPUT/OUTPUT JSON. The same `runId`-driven state powers a read-only replay mode on the editor route (`?run=<id>`), so `/executions` links straight into the canvas. A new `VariablePicker` walks the canvas graph backward to list real upstream variables (using actual captured output when available) and inserts `{{path}}` at the cursor in every templatable field.

**Tech Stack:** Next.js/React 19, `@xyflow/react`, `react-hook-form` + `zod`, Prisma 7, Inngest, `@inngest/realtime`, `nuqs`, Jotai, `bun test`.

**Spec:** `docs/superpowers/specs/2026-08-17-execution-inspector-design.md`

## Global Constraints

- No tRPC router in this codebase has direct unit tests (no test-DB harness) — don't invent that pattern here.
- `run-workflow.ts` stays free of Prisma/DB imports — persistence (including the new size-cap truncation) is wired in via `recordStep`, exactly like `publish` already is.
- A run/step recording failure must never mask or replace the executor's real error — best-effort only (`.catch(() => {})`), same rule `publishStatus` already follows.
- New Prisma changes are additive only — no existing column's type or nullability changes.
- No new npm dependencies. Every task builds on packages already in `package.json`.
- Run `bun run generate` (or `bun run migrate:dev`, which does this automatically) after any `prisma/schema.prisma` change, and commit the regenerated files under `src/generated/prisma/` — that directory is tracked in git in this repo.
- `status` on a node's `data` is transient/live-only and must never be written back by autosave — this already holds (`use-autosave.ts`'s `stripStatus`) and nothing in this plan changes it; replay-mode's hydrated status must follow the same rule (autosave is disabled entirely in replay mode, so this is moot there, but no task should special-case `status` into a persisted field).
- New tests use `bun test` (`describe`/`test`/`expect` from `"bun:test"`).

---

### Task 1: Schema — `WorkflowRunStep.input`/`output`

**Files:**
- Modify: `prisma/schema.prisma` (the `WorkflowRunStep` model)

**Interfaces:**
- Produces: `WorkflowRunStep.input`/`.output` as `Json | null` on the generated Prisma client, consumed by every later task that reads or writes a step's data.

- [ ] **Step 1: Add the columns**

In `prisma/schema.prisma`, find the `WorkflowRunStep` model:

```prisma
model WorkflowRunStep {
  id          String      @id @default(cuid())
  runId       String
  run         WorkflowRun @relation(fields: [runId], references: [id], onDelete: Cascade)
  nodeId      String
  nodeName    String
  nodeType    String
  status      RunStatus   @default(RUNNING)
  startedAt   DateTime    @default(now())
  completedAt DateTime?
  error       String?

  @@unique([runId, nodeId])
  @@index([runId])
  @@map("workflow_run_step")
}
```

Change it to:

```prisma
model WorkflowRunStep {
  id          String      @id @default(cuid())
  runId       String
  run         WorkflowRun @relation(fields: [runId], references: [id], onDelete: Cascade)
  nodeId      String
  nodeName    String
  nodeType    String
  status      RunStatus   @default(RUNNING)
  startedAt   DateTime    @default(now())
  completedAt DateTime?
  error       String?
  input       Json?
  output      Json?

  @@unique([runId, nodeId])
  @@index([runId])
  @@map("workflow_run_step")
}
```

- [ ] **Step 2: Run the migration**

Run: `bun run migrate:dev -- --name add_step_input_output`

This requires a reachable Postgres instance per `DATABASE_URL` in `.env`. It regenerates the Prisma client under `src/generated/prisma/`.

- [ ] **Step 3: Verify the generated client**

Run: `grep -n "input" src/generated/prisma/client/models/WorkflowRunStep.ts 2>/dev/null || grep -rn "input" src/generated/prisma/ | grep -i "workflowrunstep" | head -5`

Expected: the generated types show `input`/`output` as optional/nullable `JsonValue` fields on `WorkflowRunStep`. (Exact file path may vary by Prisma's generated-client layout — if the above doesn't match, run `bunx tsc --noEmit` instead and confirm no new errors, which is sufficient confirmation the client regenerated correctly.)

- [ ] **Step 4: Typecheck**

Run: `bunx tsc --noEmit`
Expected: same pre-existing errors as before this change (5 errors, all in `src/components/ui/resizable.tsx`, unrelated) — no new errors.

- [ ] **Step 5: Commit**

```bash
git add prisma/schema.prisma prisma/migrations src/generated/prisma
git commit -m "feat: add input/output columns to WorkflowRunStep

Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>"
```

---

### Task 2: `diffContext` pure function

**Files:**
- Create: `src/inngest/lib/diff-context.ts`
- Test: `src/inngest/lib/diff-context.test.ts`

**Interfaces:**
- Produces: `diffContext(before: WorkflowContext, after: WorkflowContext): WorkflowContext`, consumed by `run-workflow.ts` (Task 3).

- [ ] **Step 1: Write the failing tests**

Create `src/inngest/lib/diff-context.test.ts`:

```ts
import { describe, expect, test } from "bun:test";
import { diffContext } from "./diff-context";

describe("diffContext", () => {
  test("returns an empty object when nothing changed", () => {
    expect(diffContext({ a: 1 }, { a: 1 })).toEqual({});
  });

  test("includes a genuinely new key", () => {
    expect(diffContext({ a: 1 }, { a: 1, b: 2 })).toEqual({ b: 2 });
  });

  test("includes a key whose value changed", () => {
    expect(diffContext({ a: 1 }, { a: 2 })).toEqual({ a: 2 });
  });

  test("excludes unchanged keys while including changed ones", () => {
    expect(diffContext({ a: 1, b: "x" }, { a: 1, b: "y" })).toEqual({ b: "y" });
  });

  test("handles nested object values by deep comparison, not reference", () => {
    const before = { httpResponse: { status: 200, data: { id: 1 } } };
    const after = { httpResponse: { status: 200, data: { id: 1 } } };
    expect(diffContext(before, after)).toEqual({});
  });

  test("both empty returns empty", () => {
    expect(diffContext({}, {})).toEqual({});
  });

  test("real executor shape: adding one variableName key", () => {
    const before = {};
    const after = { myHttp: { httpResponse: { status: 200, data: { ok: true } } } };
    expect(diffContext(before, after)).toEqual({
      myHttp: { httpResponse: { status: 200, data: { ok: true } } },
    });
  });
});
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `bun test src/inngest/lib/diff-context.test.ts`
Expected: FAIL — `diff-context.ts` does not exist yet (module not found).

- [ ] **Step 3: Write the implementation**

Create `src/inngest/lib/diff-context.ts`:

```ts
import type { WorkflowContext } from "@/features/workflows/nodes/executions/types";

/**
 * Returns only the top-level keys of `after` that are new or whose value
 * differs from `before` — a generic, executor-agnostic way to capture
 * "what did this node actually produce." Every existing executor spreads
 * `...context` and adds exactly one new key (`{ [variableName]: value }`),
 * so this reduces to exactly that key for every node type today, without
 * this function needing to know anything about which executor ran.
 *
 * Compares by JSON-serialized value, not reference: executors always
 * return a fresh context object (`{ ...context, ... }`), so reference
 * equality would treat every key as "changed" even when its value is
 * identical.
 */
export function diffContext(
  before: WorkflowContext,
  after: WorkflowContext,
): WorkflowContext {
  const diff: WorkflowContext = {};
  for (const key of Object.keys(after)) {
    if (!(key in before) || JSON.stringify(before[key]) !== JSON.stringify(after[key])) {
      diff[key] = after[key];
    }
  }
  return diff;
}
```

- [ ] **Step 4: Run the tests to verify they pass**

Run: `bun test src/inngest/lib/diff-context.test.ts`
Expected: PASS (7 tests)

- [ ] **Step 5: Commit**

```bash
git add src/inngest/lib/diff-context.ts src/inngest/lib/diff-context.test.ts
git commit -m "feat: add diffContext for computing a node's output from context before/after

Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>"
```

---

### Task 3: Wire `diffContext` into `runWorkflow`'s `recordStep`

**Files:**
- Modify: `src/inngest/run-workflow.ts` (full file)
- Modify: `src/inngest/run-workflow.test.ts:99-155` (update two existing assertions, add one new test)

**Interfaces:**
- Consumes: `diffContext` (Task 2).
- Produces: `RunWorkflowParams.recordStep` now optionally receives `input`/`output`, consumed by `function.ts` (Task 4).

- [ ] **Step 1: Update the failing/changing tests first**

In `src/inngest/run-workflow.test.ts`, the existing test `"calls recordStep with loading then success for each executed node"` currently asserts (around line 118):

```ts
    expect(stepCalls).toEqual([
      { nodeId: "a", nodeName: "MANUAL_TRIGGER", nodeType: "MANUAL_TRIGGER", status: "loading" },
      { nodeId: "a", nodeName: "MANUAL_TRIGGER", nodeType: "MANUAL_TRIGGER", status: "success" },
      { nodeId: "b", nodeName: "HTTP_REQUEST", nodeType: "HTTP_REQUEST", status: "loading" },
      { nodeId: "b", nodeName: "HTTP_REQUEST", nodeType: "HTTP_REQUEST", status: "success" },
    ]);
```

Change it to (the `passthroughExecutor` used by this test returns `{ context }` unchanged, so the diff is empty for both nodes):

```ts
    expect(stepCalls).toEqual([
      { nodeId: "a", nodeName: "MANUAL_TRIGGER", nodeType: "MANUAL_TRIGGER", status: "loading" },
      {
        nodeId: "a",
        nodeName: "MANUAL_TRIGGER",
        nodeType: "MANUAL_TRIGGER",
        status: "success",
        input: {},
        output: {},
      },
      { nodeId: "b", nodeName: "HTTP_REQUEST", nodeType: "HTTP_REQUEST", status: "loading" },
      {
        nodeId: "b",
        nodeName: "HTTP_REQUEST",
        nodeType: "HTTP_REQUEST",
        status: "success",
        input: {},
        output: {},
      },
    ]);
```

The existing test `"calls recordStep with an error event and still rethrows when an executor throws"` currently asserts (around line 153):

```ts
    expect(stepCalls).toEqual([
      { nodeId: "a", nodeName: "MANUAL_TRIGGER", nodeType: "MANUAL_TRIGGER", status: "loading" },
      { nodeId: "a", nodeName: "MANUAL_TRIGGER", nodeType: "MANUAL_TRIGGER", status: "error", error: "boom" },
    ]);
```

Change it to (an error event has an `input` — the context right before the failing call — but no `output`, since the executor never returned one):

```ts
    expect(stepCalls).toEqual([
      { nodeId: "a", nodeName: "MANUAL_TRIGGER", nodeType: "MANUAL_TRIGGER", status: "loading" },
      {
        nodeId: "a",
        nodeName: "MANUAL_TRIGGER",
        nodeType: "MANUAL_TRIGGER",
        status: "error",
        error: "boom",
        input: {},
      },
    ]);
```

Also update `makeFakeRecordStep`'s inner type (near the top of the file) to widen the recorded event shape:

```ts
function makeFakeRecordStep() {
  const calls: {
    nodeId: string;
    nodeName: string;
    nodeType: string;
    status: string;
    error?: string;
    input?: Record<string, unknown>;
    output?: Record<string, unknown>;
  }[] = [];
  const recordStep = async (event: {
    nodeId: string;
    nodeName: string;
    nodeType: string;
    status: "loading" | "success" | "error";
    error?: string;
    input?: Record<string, unknown>;
    output?: Record<string, unknown>;
  }) => {
    calls.push(event);
  };
  return { recordStep: recordStep as Parameters<typeof runWorkflow>[0]["recordStep"], calls };
}
```

Then add one new test after the error-event test, asserting a real (non-empty) diff end-to-end:

```ts
  test("recordStep receives the actual context diff as output on success", async () => {
    const nodes = [makeNode("a", "HTTP_REQUEST")];
    const connections: ReturnType<typeof makeConnection>[] = [];
    const { publish } = makeFakePublish();
    const { recordStep, calls: stepCalls } = makeFakeRecordStep();
    const addsAVariable: NodeExecutor = async ({ context }) => ({
      context: { ...context, myHttp: { httpResponse: { status: 200 } } },
    });

    await runWorkflow({
      nodes,
      connections,
      initialData: { seed: true },
      step: fakeStep,
      userId: "test-user",
      workflowID: "workflow-1",
      publish,
      recordStep,
      getExecutor: () => addsAVariable,
    });

    const successCall = stepCalls.find((call) => call.status === "success");
    expect(successCall?.input).toEqual({ seed: true });
    expect(successCall?.output).toEqual({ myHttp: { httpResponse: { status: 200 } } });
  });
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `bun test src/inngest/run-workflow.test.ts`
Expected: FAIL — the two updated assertions fail (actual calls don't yet include `input`/`output`), and the new test's `successCall?.input`/`.output` are `undefined`.

- [ ] **Step 3: Update the implementation**

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
    await recordNodeStatus(node, "success", {
      input,
      output: diffContext(input, result.context),
    }).catch(() => {});

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

(Note: `recordNodeStatus`'s third parameter changed from a bare `error?: string` to an `options` object carrying `error`/`input`/`output` — this is a signature change internal to this file only; nothing outside `run-workflow.ts` calls `recordNodeStatus` directly.)

- [ ] **Step 4: Run the tests to verify they pass**

Run: `bun test src/inngest/run-workflow.test.ts`
Expected: PASS (all tests, including the new one — 9 total)

- [ ] **Step 5: Typecheck**

Run: `bunx tsc --noEmit`
Expected: same 5 pre-existing `resizable.tsx` errors, no new ones.

- [ ] **Step 6: Commit**

```bash
git add src/inngest/run-workflow.ts src/inngest/run-workflow.test.ts
git commit -m "feat: capture input/output diff in runWorkflow's recordStep calls

Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>"
```

---

### Task 4: Run-ID correlation + persist input/output in `function.ts`

**Files:**
- Modify: `src/features/workflows/server/index.ts:16-32` (the `execute` procedure)
- Modify: `src/inngest/function.ts` (full file)
- Modify: `src/features/workflows/hooks/use-workflows.ts:138-150` (`useExecuteWorkflow`)

**Interfaces:**
- Consumes: `RunWorkflowParams.recordStep`'s new `input`/`output` (Task 3).
- Produces: `workflowsRouter.execute` now returns `{ workflow: Workflow; runId: string }` instead of the bare `Workflow` row — consumed by `ExecuteWorkflowButton`/`Editor` (Task 5).

- [ ] **Step 1: `workflowsRouter.execute` creates the run row synchronously**

In `src/features/workflows/server/index.ts`, replace the `execute` procedure:

```ts
  execute: protectedProcedure
  .input(z.object({id:z.string()}))
  .mutation(async({ctx,input})=>{
    const workflow = await ctx.prisma.workflow.findFirstOrThrow({
      where:{
        id:input.id,
        userId:ctx.auth.user.id
      },
    });

    await inngest.send({
      name:"workflows/execute.workflow",
      data:{
        workflowID: input.id
      }
    })
    
    return workflow
  }),
```

with:

```ts
  execute: protectedProcedure
  .input(z.object({id:z.string()}))
  .mutation(async({ctx,input})=>{
    const workflow = await ctx.prisma.workflow.findFirstOrThrow({
      where:{
        id:input.id,
        userId:ctx.auth.user.id
      },
    });

    const run = await ctx.prisma.workflowRun.create({
      data: {
        workflowId: input.id,
        userId: ctx.auth.user.id,
        status: "RUNNING",
      },
    });

    await inngest.send({
      name:"workflows/execute.workflow",
      data:{
        workflowID: input.id,
        runId: run.id
      }
    })
    
    return { workflow, runId: run.id }
  }),
```

This write is deliberately *not* wrapped in a try/catch that swallows failure — unlike the best-effort recording inside the Inngest function itself, if creating the run row fails here the mutation should fail outright, before the workflow even starts, rather than running with no way to inspect it.

- [ ] **Step 2: `function.ts` reads the pre-created run, records input/output with a size cap**

Replace the full contents of `src/inngest/function.ts` with:

```ts
import { NonRetriableError } from "inngest";
import { inngest } from "./client";
import { prisma } from "@/lib/db";
import { runWorkflow } from "./run-workflow";
import { getExecutor } from "@/features/workflows/nodes/executions/lib/executor-registry";
import type { Connection, Node } from "@/generated/prisma/client";
import { RunStatus } from "@/generated/prisma/enums";
import type { WorkflowContext } from "@/features/workflows/nodes/executions/types";

// Above this size (in serialized characters — a close enough proxy for
// bytes for this purpose), an input/output snapshot is replaced with a
// small placeholder instead of being written in full. Comfortably above
// any real prompt/HTTP-response payload this app currently produces,
// while still bounding the worst case a pathological response could hit.
const MAX_SNAPSHOT_CHARS = 128_000;

function safeSnapshot(value: WorkflowContext | undefined): unknown {
  if (value === undefined) return undefined;
  const serialized = JSON.stringify(value);
  if (serialized.length > MAX_SNAPSHOT_CHARS) {
    return { truncated: true, byteLength: serialized.length };
  }
  return value;
}

export const executeWorkflow = inngest.createFunction(
  { id: "execute-workflow" },
  { event: "workflows/execute.workflow" },
  async ({ event, step, publish }) => {
    const workflowID = event.data.workflowID;
    const runId = event.data.runId;
    if (!workflowID) {
      throw new NonRetriableError("Workflow ID is missing");
    }
    if (!runId) {
      throw new NonRetriableError("Run ID is missing");
    }

    const workflow = await step.run("prepare-workflow", async () => {
      return prisma.workflow.findUniqueOrThrow({
        where: { id: workflowID },
        include: { nodes: true, connections: true },
      });
    });

    const recordStep = async (event: {
      nodeId: string;
      nodeName: string;
      nodeType: string;
      status: "loading" | "success" | "error";
      error?: string;
      input?: WorkflowContext;
      output?: WorkflowContext;
    }) => {
      const status =
        event.status === "loading"
          ? RunStatus.RUNNING
          : event.status === "success"
            ? RunStatus.SUCCESS
            : RunStatus.ERROR;
      const input = safeSnapshot(event.input);
      const output = safeSnapshot(event.output);
      await step
        .run(`record-step-${event.status}-${event.nodeId}`, async () => {
          await prisma.workflowRunStep.upsert({
            where: { runId_nodeId: { runId, nodeId: event.nodeId } },
            create: {
              runId,
              nodeId: event.nodeId,
              nodeName: event.nodeName,
              nodeType: event.nodeType,
              status,
              input,
              output,
            },
            update: {
              status,
              completedAt: event.status === "loading" ? undefined : new Date(),
              error: event.error,
              input,
              output,
            },
          });
        })
        // Best effort only — a step-recording failure must never mask the
        // executor's real error. Same rule `publishStatus`'s own error-path
        // publish already follows in run-workflow.ts.
        .catch(() => {});
    };

    try {
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
        recordStep,
      });

      await step
        .run("record-run-success", async () => {
          await prisma.workflowRun.update({
            where: { id: runId },
            data: { status: RunStatus.SUCCESS, completedAt: new Date() },
          });
        })
        .catch(() => {});

      return {
        workflowID,
        result,
      };
    } catch (error) {
      await step
        .run("record-run-error", async () => {
          await prisma.workflowRun.update({
            where: { id: runId },
            data: {
              status: RunStatus.ERROR,
              completedAt: new Date(),
              error: error instanceof Error ? error.message : String(error),
            },
          });
        })
        .catch(() => {});
      throw error;
    }
  },
);
```

The `record-run-start` step is gone entirely — the run row already exists by the time this function runs, created synchronously by the mutation in Step 1.

- [ ] **Step 3: Update `useExecuteWorkflow`'s one read of the old return shape**

In `src/features/workflows/hooks/use-workflows.ts`, `useExecuteWorkflow`'s `onSuccess` currently reads:

```ts
      onSuccess: (data) => {
        toast.success(`Workflow ${data.name} executed!`);
      },
```

Change to:

```ts
      onSuccess: (data) => {
        toast.success(`Workflow ${data.workflow.name} executed!`);
      },
```

- [ ] **Step 4: Typecheck**

Run: `bunx tsc --noEmit`
Expected: same 5 pre-existing `resizable.tsx` errors, no new ones. (If you see an error about `event.data.runId` not existing on the Inngest event's data type, the event schema is inferred structurally from every `inngest.send` call site in this codebase — Step 1's `data: { workflowID, runId }` is what teaches the type; if there's a stricter, explicitly-declared event schema elsewhere, add `runId: z.string()` to it the same way `workflowID` is already declared there.)

- [ ] **Step 5: Manual smoke test**

Run `bun run dev:all`. Execute any workflow with a Manual Trigger. In the Inngest dev server (http://localhost:8288 → Runs → latest run), confirm: `prepare-workflow` ran, `record-step-loading-*`/`record-step-success-*` steps ran (no `record-run-start` step — it no longer exists), and `record-run-success` ran. Then run `bunx prisma studio` (or `bun run studio`) and confirm the `workflow_run_step` rows for that run have non-null `input`/`output` JSON.

- [ ] **Step 6: Commit**

```bash
git add src/features/workflows/server/index.ts src/inngest/function.ts src/features/workflows/hooks/use-workflows.ts
git commit -m "feat: create WorkflowRun synchronously in execute, persist step input/output

Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>"
```

---

### Task 5: Editor tracks the active `runId`

**Files:**
- Modify: `src/features/workflows/nodes/execute-workflow.tsx` (full file)
- Modify: `src/features/workflows/editor/components/editor.tsx:39-146` (add `runId` state, thread into `ExecuteWorkflowButton`)

**Interfaces:**
- Consumes: `workflowsRouter.execute`'s new `{ workflow, runId }` return shape (Task 4).
- Produces: `Editor`'s local `runId: string | null` state, consumed by `NodeOutputDrawer` (Task 7), `VariablePicker` (Task 9), and replay mode (Task 12).

- [ ] **Step 1: `ExecuteWorkflowButton` surfaces the new `runId`**

Replace the full contents of `src/features/workflows/nodes/execute-workflow.tsx`:

```tsx
import { Button } from "@/components/ui/button";
import { FlaskConicalIcon } from "lucide-react";
import { useExecuteWorkflow } from "../hooks/use-workflows";

interface Props {
  workflowID: string;
  onExecuteStart?: (runId: string) => void;
}

export const ExecuteWorkflowButton = ({ workflowID, onExecuteStart }: Props) => {
  const executeWorkflow = useExecuteWorkflow();
  const handleExecute = () => {
    executeWorkflow.mutate(
      { id: workflowID },
      {
        onSuccess: (data) => {
          onExecuteStart?.(data.runId);
        },
      },
    );
  };
  return (
    <Button size="lg" disabled={executeWorkflow.isPending} onClick={handleExecute}>
      <FlaskConicalIcon className="size-4" />
      Execute Workflow
    </Button>
  );
};
```

(`onExecuteStart` moves from firing immediately on click to firing once the mutation actually resolves with a `runId` — it previously ran eagerly to reset every node's status to `"initial"` before the run began. That reset now happens in `Editor`'s `handleExecuteStart`, Step 2 below, called with the real `runId` instead of nothing.)

- [ ] **Step 2: `Editor` tracks `runId` and resets status on the new callback shape**

In `src/features/workflows/editor/components/editor.tsx`, add local state for the active run and update `handleExecuteStart`'s signature. Find:

```tsx
  const statusMessages = useWorkflowExecutionStatus(workflowID);
```

Add immediately before it:

```tsx
  const [runId, setRunId] = useState<string | null>(null);
```

Find:

```tsx
  const handleExecuteStart = useCallback(() => {
    setNodes((currentNodes) =>
      currentNodes.map((node) => ({ ...node, data: { ...node.data, status: "initial" } })),
    );
  }, []);
```

Replace with:

```tsx
  const handleExecuteStart = useCallback((newRunId: string) => {
    setRunId(newRunId);
    setNodes((currentNodes) =>
      currentNodes.map((node) => ({ ...node, data: { ...node.data, status: "initial" } })),
    );
  }, []);
```

The `<ExecuteWorkflowButton>` render call site (`onExecuteStart={handleExecuteStart}`) needs no change — the prop still just forwards the callback, only its argument changed.

- [ ] **Step 3: Typecheck**

Run: `bunx tsc --noEmit`
Expected: same 5 pre-existing errors, no new ones.

- [ ] **Step 4: Manual verification**

Run `bun run dev:all`, open a workflow with a Manual Trigger, click Execute Workflow. Confirm the run still executes and node status badges still update live exactly as before (this task only adds state tracking — no visible behavior change yet; the `runId` isn't consumed by anything until Task 7).

- [ ] **Step 5: Commit**

```bash
git add src/features/workflows/nodes/execute-workflow.tsx src/features/workflows/editor/components/editor.tsx
git commit -m "feat: Editor tracks the active run's id

Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>"
```

---

### Task 6: Clickable status badge — shared atom, no prop-threading

**Files:**
- Modify: `src/features/workflows/editor/store/atoms.ts` (full file)
- Modify: `src/features/workflows/nodes/react-flow/base-node.tsx` (full file)
- Modify: `src/features/workflows/nodes/executions/components/base-execution-node.tsx:29-38` (pass `id`)
- Modify: `src/features/workflows/nodes/executions/components/base-branch-node.tsx:49-59` (pass `id`)

**Interfaces:**
- Produces: `selectedOutputNodeIdAtom` (`Atom<string | null>`) and `editorReadOnlyAtom` (`Atom<boolean>`), consumed by `NodeOutputDrawer` (Task 7) and `WorkflowNode`/`Editor` (Task 12).

- [ ] **Step 1: Add the two new atoms**

Replace the full contents of `src/features/workflows/editor/store/atoms.ts`:

```ts
import type { ReactFlowInstance } from "@xyflow/react";
import { atom } from "jotai";

export const editorAtom = atom<ReactFlowInstance | null>(null);

// Autosave state
export const autosaveEnabledAtom = atom<boolean>(true);
export const autosaveStatusAtom = atom<{
  isSaving: boolean;
  lastSaved: Date | null;
}>({
  isSaving: false,
  lastSaved: null,
});

/**
 * Which node's execution output the NodeOutputDrawer is showing, if any.
 * Set by clicking a node's status badge (see BaseNode) — a shared atom
 * rather than a prop threaded through all 13 node components, since the
 * badge itself already lives in one shared place (BaseNode) but the
 * drawer that reacts to it is mounted once at the Editor level.
 */
export const selectedOutputNodeIdAtom = atom<string | null>(null);

/**
 * True while viewing a past run's canvas in read-only replay mode (see
 * Editor's `?run=` handling). WorkflowNode reads this to hide its
 * Settings/Delete toolbar — the one place every node type's edit
 * affordances already funnel through, so this is a single-file guard
 * rather than a readOnly prop threaded through every node component.
 */
export const editorReadOnlyAtom = atom<boolean>(false);
```

- [ ] **Step 2: `BaseNode`'s status icon becomes a clickable badge**

Replace the full contents of `src/features/workflows/nodes/react-flow/base-node.tsx`:

```tsx
import type { ComponentProps } from "react";
import { useSetAtom } from "jotai";

import { cn } from "@/lib/utils";
import { type NodeStatus, NodeStatusIndicator } from "./status-indicator";
import { CheckCircleIcon, LoaderCircleIcon, XCircleIcon } from "lucide-react";
import { selectedOutputNodeIdAtom } from "../../editor/store/atoms";

interface BaseNodeProps extends ComponentProps<"div"> {
  /** Required to make the status badge clickable — omit only for a node
   * type that intentionally never shows output (none exist today). */
  id?: string;
  status?: NodeStatus;
  statusClassName?: string;
}

export function BaseNode({
  className,
  id,
  status,
  statusClassName,
  children,
  ...props
}: BaseNodeProps) {
  const setSelectedOutputNodeId = useSetAtom(selectedOutputNodeIdAtom);
  const canShowOutput = Boolean(id) && (status === "success" || status === "error");

  const handleBadgeClick = (event: React.MouseEvent) => {
    event.stopPropagation();
    if (id) setSelectedOutputNodeId(id);
  };

  const nodeContent = (
    <div
      className={cn(
        "bg-card text-card-foreground relative rounded-md border",
        "hover:ring-1",
        // React Flow displays node elements inside of a `NodeWrapper` component,
        // which compiles down to a div with the class `react-flow__node`.
        // When a node is selected, the class `selected` is added to the
        // `react-flow__node` element. This allows us to style the node when it
        // is selected, using Tailwind's `&` selector.
        "[.react-flow\\_\\_node.selected_&]:border-muted-foreground",
        "[.react-flow\\_\\_node.selected_&]:shadow-lg",
        className,
      )}
      // biome-ignore lint/a11y/noNoninteractiveTabindex:>
      tabIndex={0}
      {...props}
    >
      {children}
      {status === "error" &&
        (canShowOutput ? (
          <button
            type="button"
            onClick={handleBadgeClick}
            aria-label="View this node's execution output"
            className="absolute right-1.5 bottom-1.5 cursor-pointer"
          >
            <XCircleIcon className="size-2 text-red-500 fill-red-100" />
          </button>
        ) : (
          <XCircleIcon className="absolute right-1.5 bottom-1.5 size-2 text-red-500 fill-red-100" />
        ))}
      {status === "success" &&
        (canShowOutput ? (
          <button
            type="button"
            onClick={handleBadgeClick}
            aria-label="View this node's execution output"
            className="absolute right-1.5 bottom-1.5 cursor-pointer"
          >
            <CheckCircleIcon className="size-2 text-emerald-500 fill-emerald-100" />
          </button>
        ) : (
          <CheckCircleIcon className="absolute right-1.5 bottom-1.5 size-2 text-emerald-500 fill-emerald-100" />
        ))}
      {status === "loading" && (
        <LoaderCircleIcon className="absolute right-0.5 bottom-0.5 size-2 text-blue-500 animate-spin" />
      )}
    </div>
  );

  if (status && status !== "initial") {
    return (
      <div className="relative">
        <NodeStatusIndicator status={status} className={statusClassName}>
          {nodeContent}
        </NodeStatusIndicator>
      </div>
    );
  }

  return nodeContent;
}

/**
 * A container for a consistent header layout intended to be used inside the
 * `<BaseNode />` component.
 */
export function BaseNodeHeader({
  className,
  ...props
}: ComponentProps<"header">) {
  return (
    <header
      {...props}
      className={cn(
        "mx-0 my-0 -mb-1 flex flex-row items-center justify-between gap-2 px-3 py-2",
        // Remove or modify these classes if you modify the padding in the
        // `<BaseNode />` component.
        className,
      )}
    />
  );
}

/**
 * The title text for the node. To maintain a native application feel, the title
 * text is not selectable.
 */
export function BaseNodeHeaderTitle({
  className,
  ...props
}: ComponentProps<"h3">) {
  return (
    <h3
      data-slot="base-node-title"
      className={cn(
        "user-select-none flex-1 font-semibold",
        className,
      )}
      {...props}
    />
  );
}

export function BaseNodeContent({
  className,
  ...props
}: ComponentProps<"div">) {
  return (
    <div
      data-slot="base-node-content"
      className={cn("flex flex-col gap-y-2 p-3", className)}
      {...props}
    />
  );
}

export function BaseNodeFooter({
  className,
  ...props
}: ComponentProps<"div">) {
  return (
    <div
      data-slot="base-node-footer"
      className={cn(
        "flex flex-col items-center gap-y-2 border-t px-3 pt-2 pb-3",
        className,
      )}
      {...props}
    />
  );
}
```

- [ ] **Step 3: `BaseExecutionNode` passes `id` down**

In `src/features/workflows/nodes/executions/components/base-execution-node.tsx`, find:

```tsx
                    <BaseNode status={status} onDoubleClick={onDoubleClick}>
```

Change to:

```tsx
                    <BaseNode id={id} status={status} onDoubleClick={onDoubleClick}>
```

- [ ] **Step 4: `BaseBranchNode` passes `id` down**

In `src/features/workflows/nodes/executions/components/base-branch-node.tsx`, find:

```tsx
          <BaseNode status={status} onDoubleClick={onDoubleClick}>
```

Change to:

```tsx
          <BaseNode id={id} status={status} onDoubleClick={onDoubleClick}>
```

(`AgentNode` composes `BaseNode` directly rather than through `BaseExecutionNode`/`BaseBranchNode` — it already passes nothing extra to `BaseNode` beyond `status`/`onDoubleClick` today. It picks up the clickable badge automatically once Task 7's drawer exists, but needs its own one-line change: in `src/features/workflows/nodes/executions/components/agent/node.tsx`, find `<BaseNode status={nodeStatus} onDoubleClick={handleOpenSettings}>` and change to `<BaseNode id={id} status={nodeStatus} onDoubleClick={handleOpenSettings}>`.)

- [ ] **Step 5: Typecheck**

Run: `bunx tsc --noEmit`
Expected: same 5 pre-existing errors, no new ones.

- [ ] **Step 6: Manual verification**

Run `bun run dev:all`, execute a workflow, and confirm each node's success/error badge is now a clickable button (hover shows a pointer cursor) — clicking it doesn't visibly do anything yet (the drawer that reacts to `selectedOutputNodeIdAtom` doesn't exist until Task 7), but it also must not throw a console error or deselect/move the node.

- [ ] **Step 7: Commit**

```bash
git add src/features/workflows/editor/store/atoms.ts src/features/workflows/nodes/react-flow/base-node.tsx src/features/workflows/nodes/executions/components/base-execution-node.tsx src/features/workflows/nodes/executions/components/base-branch-node.tsx src/features/workflows/nodes/executions/components/agent/node.tsx
git commit -m "feat: make node status badges clickable via a shared atom

Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>"
```

---

### Task 7: `NodeOutputDrawer`

**Files:**
- Create: `src/features/workflows/editor/components/node-output-drawer.tsx`
- Modify: `src/features/workflows/editor/components/editor.tsx` (mount the drawer)

**Interfaces:**
- Consumes: `selectedOutputNodeIdAtom` (Task 6), `runId` state (Task 5), `trpc.executions.getById` (existing, now returning `input`/`output` per step since Task 1).
- Produces: `NodeOutputDrawer` component, mounted once in `Editor`.

- [ ] **Step 1: Create the drawer**

Create `src/features/workflows/editor/components/node-output-drawer.tsx`:

```tsx
"use client";

import { Suspense } from "react";
import { ErrorBoundary } from "react-error-boundary";
import { useAtom } from "jotai";
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";
import { LoadingView, ErrorView } from "@/components/dashboard";
import { useTRPC } from "@/trpc/client";
import { useSuspenseQuery } from "@tanstack/react-query";
import { selectedOutputNodeIdAtom } from "../store/atoms";

interface JsonPanelProps {
  label: string;
  value: unknown;
}

function JsonPanel({ label, value }: JsonPanelProps) {
  const isTruncated =
    value !== null &&
    typeof value === "object" &&
    "truncated" in (value as Record<string, unknown>);

  return (
    <div className="flex flex-col gap-1.5">
      <h4 className="text-sm font-medium">{label}</h4>
      {value === undefined || value === null ? (
        <p className="text-xs text-muted-foreground">Not captured for this step.</p>
      ) : isTruncated ? (
        <p className="rounded-md border bg-muted/30 p-3 text-xs text-muted-foreground">
          Too large to display ({(value as { byteLength: number }).byteLength.toLocaleString()}{" "}
          characters).
        </p>
      ) : (
        <pre className="max-h-64 overflow-auto rounded-md border bg-muted/30 p-3 font-mono text-xs">
          {JSON.stringify(value, null, 2)}
        </pre>
      )}
    </div>
  );
}

interface DrawerContentProps {
  runId: string;
  nodeId: string;
}

const DrawerContent = ({ runId, nodeId }: DrawerContentProps) => {
  const trpc = useTRPC();
  const { data: run } = useSuspenseQuery(trpc.executions.getById.queryOptions({ id: runId }));
  const runStep = run.steps.find((step) => step.nodeId === nodeId);

  if (!runStep) {
    return (
      <p className="text-sm text-muted-foreground">
        No execution data for this node in the current run.
      </p>
    );
  }

  return (
    <div className="flex flex-col gap-6">
      <div>
        <p className="text-sm font-medium">{runStep.nodeName}</p>
        <p className="text-xs text-muted-foreground">{runStep.nodeType}</p>
      </div>
      {runStep.error && (
        <div className="rounded-lg border border-destructive/30 bg-destructive/5 p-3 text-sm text-destructive">
          {runStep.error}
        </div>
      )}
      <JsonPanel label="Input" value={runStep.input} />
      <JsonPanel label="Output" value={runStep.output} />
    </div>
  );
};

interface NodeOutputDrawerProps {
  runId: string | null;
}

export const NodeOutputDrawer = ({ runId }: NodeOutputDrawerProps) => {
  const [selectedNodeId, setSelectedNodeId] = useAtom(selectedOutputNodeIdAtom);
  const open = selectedNodeId !== null;

  return (
    <Sheet open={open} onOpenChange={(next) => !next && setSelectedNodeId(null)}>
      <SheetContent className="overflow-y-auto">
        <SheetHeader>
          <SheetTitle>Node output</SheetTitle>
          <SheetDescription>Input and output data for this node's last run.</SheetDescription>
        </SheetHeader>
        <div className="px-4 pb-4">
          {selectedNodeId && runId && (
            <ErrorBoundary fallback={<ErrorView message="Couldn't load this node's output" />}>
              <Suspense fallback={<LoadingView message="Loading output..." />}>
                <DrawerContent runId={runId} nodeId={selectedNodeId} />
              </Suspense>
            </ErrorBoundary>
          )}
          {selectedNodeId && !runId && (
            <p className="text-sm text-muted-foreground">
              No run to show output for yet — execute this workflow first.
            </p>
          )}
        </div>
      </SheetContent>
    </Sheet>
  );
};
```

- [ ] **Step 2: Mount it in `Editor`**

In `src/features/workflows/editor/components/editor.tsx`, add the import:

```tsx
import { NodeOutputDrawer } from "./node-output-drawer";
```

Find the closing of the `<ReactFlow>` element:

```tsx
      </ReactFlow>
    </div>
  );
};
```

Change to:

```tsx
      </ReactFlow>
      <NodeOutputDrawer runId={runId} />
    </div>
  );
};
```

- [ ] **Step 3: Typecheck**

Run: `bunx tsc --noEmit`
Expected: same 5 pre-existing errors, no new ones.

- [ ] **Step 4: Manual verification**

Run `bun run dev:all`, execute a workflow with at least one HTTP Request node, wait for it to finish, and click its success badge. Confirm the drawer opens showing that node's name/type and INPUT/OUTPUT JSON panels — OUTPUT should show `{ "<variableName>": { "httpResponse": { ... } } }`, matching what the plan's spec describes. Click the badge on a node that hasn't run (still "initial") — nothing should happen (no badge is rendered for that status). Close the drawer (click outside or its close button) and confirm `selectedOutputNodeIdAtom` resets (reopening a different node's badge shows that node's data, not stale data from the previous one).

- [ ] **Step 5: Commit**

```bash
git add src/features/workflows/editor/components/node-output-drawer.tsx src/features/workflows/editor/components/editor.tsx
git commit -m "feat: add NodeOutputDrawer showing per-node input/output JSON

Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>"
```

---

### Task 8: `findAncestorVariables`

**Files:**
- Create: `src/features/workflows/nodes/executions/lib/find-ancestor-variables.ts`
- Test: `src/features/workflows/nodes/executions/lib/find-ancestor-variables.test.ts`

**Interfaces:**
- Produces: `findAncestorVariables(nodes: Node[], edges: Edge[], nodeId: string): AncestorVariable[]` and the `AncestorVariable` type, consumed by `VariablePicker` (Task 9).

- [ ] **Step 1: Write the failing tests**

Create `src/features/workflows/nodes/executions/lib/find-ancestor-variables.test.ts`:

```ts
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
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `bun test src/features/workflows/nodes/executions/lib/find-ancestor-variables.test.ts`
Expected: FAIL — module not found.

- [ ] **Step 3: Write the implementation**

Create `src/features/workflows/nodes/executions/lib/find-ancestor-variables.ts`:

```ts
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
```

- [ ] **Step 4: Run the tests to verify they pass**

Run: `bun test src/features/workflows/nodes/executions/lib/find-ancestor-variables.test.ts`
Expected: PASS (5 tests)

- [ ] **Step 5: Commit**

```bash
git add src/features/workflows/nodes/executions/lib/find-ancestor-variables.ts src/features/workflows/nodes/executions/lib/find-ancestor-variables.test.ts
git commit -m "feat: add findAncestorVariables graph-walk for the variable picker

Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>"
```

---

### Task 9: `VariablePicker` component

**Files:**
- Create: `src/features/workflows/nodes/executions/components/variable-picker.tsx`

**Interfaces:**
- Consumes: `findAncestorVariables` (Task 8), `trpc.executions.getById` (existing).
- Produces: `VariablePicker` component, consumed by every dialog wired in Tasks 10–11.

- [ ] **Step 1: Create the component**

Create `src/features/workflows/nodes/executions/components/variable-picker.tsx`:

```tsx
"use client";

import { useReactFlow } from "@xyflow/react";
import { BracesIcon } from "lucide-react";
import { useMemo } from "react";
import { Button } from "@/components/ui/button";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import { useTRPC } from "@/trpc/client";
import { useQuery } from "@tanstack/react-query";
import { findAncestorVariables } from "../lib/find-ancestor-variables";

// Good-enough starting points before a workflow has ever run, so a user
// can write a working expression without guessing. Once a run exists,
// PickerContent prefers the *real* captured output for any ancestor that
// actually produced one (see flattenKeys below).
const KNOWN_SHAPES: Record<string, string[]> = {
  HTTP_REQUEST: ["httpResponse.status", "httpResponse.statusText", "httpResponse.data"],
  OPENAI: ["text"],
  ANTHROPIC: ["text"],
  GEMINI: ["text"],
  GROQ: ["text"],
  DEEPSEEK: ["text"],
  MISTRAL: ["text"],
  MOONSHOT: ["text"],
  OLLAMA: ["text"],
  AGENT: ["text"],
};

/** Dot-joined paths through a plain object's own keys, up to `depth` levels
 * deep. Arrays and primitives become leaf paths rather than being expanded
 * further — enough to write a useful expression without dumping an
 * unbounded tree for a large response body. */
function flattenKeys(value: unknown, prefix = "", depth = 2): string[] {
  if (depth === 0 || value === null || typeof value !== "object" || Array.isArray(value)) {
    return prefix ? [prefix] : [];
  }
  return Object.entries(value as Record<string, unknown>).flatMap(([key, nested]) =>
    flattenKeys(nested, prefix ? `${prefix}.${key}` : key, depth - 1),
  );
}

interface VariablePickerProps {
  nodeId: string;
  runId?: string | null;
  value: string;
  cursorPosition: number;
  onInsert: (nextValue: string) => void;
}

export function VariablePicker({
  nodeId,
  runId,
  value,
  cursorPosition,
  onInsert,
}: VariablePickerProps) {
  const { getNodes, getEdges } = useReactFlow();
  const trpc = useTRPC();
  const { data: run } = useQuery({
    ...trpc.executions.getById.queryOptions({ id: runId ?? "" }),
    enabled: Boolean(runId),
  });

  const ancestors = useMemo(
    () => findAncestorVariables(getNodes(), getEdges(), nodeId),
    [getNodes, getEdges, nodeId],
  );

  const handleInsert = (path: string) => {
    const token = `{{${path}}}`;
    const next = value.slice(0, cursorPosition) + token + value.slice(cursorPosition);
    onInsert(next);
  };

  if (ancestors.length === 0) {
    return null;
  }

  return (
    <Popover>
      <PopoverTrigger asChild>
        <Button type="button" variant="ghost" size="icon-sm" aria-label="Insert a variable">
          <BracesIcon className="size-4" />
        </Button>
      </PopoverTrigger>
      <PopoverContent className="w-72 p-2" align="start">
        <div className="flex max-h-72 flex-col gap-3 overflow-y-auto">
          {ancestors.map((ancestor) => {
            const runStep = run?.steps.find((step) => step.nodeId === ancestor.nodeId);
            const realPaths =
              runStep?.output && typeof runStep.output === "object"
                ? flattenKeys(runStep.output).filter((path) =>
                    path.startsWith(`${ancestor.variableName}.`),
                  )
                : [];
            const paths =
              realPaths.length > 0
                ? realPaths
                : (KNOWN_SHAPES[ancestor.nodeType] ?? []).map(
                    (path) => `${ancestor.variableName}.${path}`,
                  );

            return (
              <div key={ancestor.nodeId} className="flex flex-col gap-1">
                <p className="text-xs font-medium text-muted-foreground">
                  {ancestor.variableName}
                </p>
                {paths.length === 0 ? (
                  <button
                    type="button"
                    onClick={() => handleInsert(ancestor.variableName)}
                    className="rounded-sm px-2 py-1 text-left font-mono text-xs hover:bg-accent"
                  >
                    {`{{${ancestor.variableName}}}`}
                  </button>
                ) : (
                  paths.map((path) => (
                    <button
                      key={path}
                      type="button"
                      onClick={() => handleInsert(path)}
                      className="rounded-sm px-2 py-1 text-left font-mono text-xs hover:bg-accent"
                    >
                      {`{{${path}}}`}
                    </button>
                  ))
                )}
              </div>
            );
          })}
        </div>
      </PopoverContent>
    </Popover>
  );
}
```

Note: `runStep.output`'s real keys are already namespaced under the ancestor's `variableName` (e.g. `{ myHttp: { httpResponse: { data: {...} } } }`), so `flattenKeys(runStep.output)` produces paths like `myHttp.httpResponse.data` directly — the `.filter((path) => path.startsWith(...))` guards against a step whose output diff happened to include more than one key (not expected today, but the diff is generic per Task 2's own doc comment).

- [ ] **Step 2: Typecheck**

Run: `bunx tsc --noEmit`
Expected: same 5 pre-existing errors, no new ones. (If `@/components/ui/popover` doesn't exist yet, check `src/components/ui/` for the exact shadcn component name first — if genuinely missing, this is a `shadcn`-generated component this codebase doesn't have yet; stop and report NEEDS_CONTEXT rather than hand-rolling a popover primitive.)

- [ ] **Step 3: Commit**

```bash
git add src/features/workflows/nodes/executions/components/variable-picker.tsx
git commit -m "feat: add VariablePicker for inserting upstream variables into template fields

Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>"
```

---

### Task 10: Wire `VariablePicker` into AI + Agent dialogs

**Files:**
- Modify: `src/features/workflows/nodes/executions/components/ai/ai-dialog.tsx` (`systemPrompt`/`userPrompt` fields, `Props`)
- Modify: `src/features/workflows/nodes/executions/components/ai/ai-node.tsx` (pass `nodeId`)
- Modify: `src/features/workflows/nodes/executions/components/agent/dialog.tsx` (`systemPrompt`/`userPrompt` fields, `Props`)
- Modify: `src/features/workflows/nodes/executions/components/agent/node.tsx` (pass `nodeId`)

**Interfaces:**
- Consumes: `VariablePicker` (Task 9).

- [ ] **Step 1: `AiNodeDialog` gains `nodeId`/`runId` props and a picker on both prompt fields**

In `src/features/workflows/nodes/executions/components/ai/ai-dialog.tsx`, add the import:

```tsx
import { useState } from "react";
import { VariablePicker } from "../variable-picker";
```

(`useState` joins the existing `useEffect` import from `"react"` — combine into one import line: `import { useEffect, useState } from "react";`.)

Extend `Props`:

```tsx
interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSubmit: (values: AiFormValues) => void;
  defaultValues?: Partial<AiFormValues>;
  providerType: AIProviderType;
  providerLabel: string;
  nodeId: string;
  runId?: string | null;
}
```

Destructure the two new props in the component signature:

```tsx
export const AiNodeDialog = ({
  open,
  onOpenChange,
  onSubmit,
  defaultValues = {},
  providerType,
  providerLabel,
  nodeId,
  runId,
}: Props) => {
```

Add cursor-position state right after the `form` is created:

```tsx
  const [systemPromptCursor, setSystemPromptCursor] = useState(0);
  const [userPromptCursor, setUserPromptCursor] = useState(0);
```

Replace the `systemPrompt` field's render:

```tsx
            <FormField
              control={form.control}
              name="systemPrompt"
              render={({ field }) => (
                <FormItem>
                  <div className="flex items-center justify-between">
                    <FormLabel>System Prompt (Optional)</FormLabel>
                    <VariablePicker
                      nodeId={nodeId}
                      runId={runId}
                      value={field.value ?? ""}
                      cursorPosition={systemPromptCursor}
                      onInsert={field.onChange}
                    />
                  </div>
                  <FormControl>
                    <Textarea
                      {...field}
                      onSelect={(event) =>
                        setSystemPromptCursor(event.currentTarget.selectionStart ?? 0)
                      }
                      placeholder="You are a helpful assistant."
                      className="min-h-[80px] font-mono text-sm"
                    />
                  </FormControl>
                  <FormDescription>
                    Use {"{{variables}}"} to reference earlier nodes' output.
                  </FormDescription>
                  <FormMessage />
                </FormItem>
              )}
            />
```

Replace the `userPrompt` field's render:

```tsx
            <FormField
              control={form.control}
              name="userPrompt"
              render={({ field }) => (
                <FormItem>
                  <div className="flex items-center justify-between">
                    <FormLabel>User Prompt</FormLabel>
                    <VariablePicker
                      nodeId={nodeId}
                      runId={runId}
                      value={field.value}
                      cursorPosition={userPromptCursor}
                      onInsert={field.onChange}
                    />
                  </div>
                  <FormControl>
                    <Textarea
                      {...field}
                      onSelect={(event) =>
                        setUserPromptCursor(event.currentTarget.selectionStart ?? 0)
                      }
                      placeholder="Summarize this: {{myApiCall.httpResponse.data}}"
                      className="min-h-[120px] font-mono text-sm"
                    />
                  </FormControl>
                  <FormDescription>
                    The prompt sent to the model. Use {"{{variables}}"} to reference
                    earlier nodes' output.
                  </FormDescription>
                  <FormMessage />
                </FormItem>
              )}
            />
```

- [ ] **Step 2: `AiNode` passes `nodeId`/`runId` through**

In `src/features/workflows/nodes/executions/components/ai/ai-node.tsx`, `createAiNode`'s inner component needs the active run's id. Since node components don't currently receive `runId` at all, and `Editor` is the only place that tracks it, thread it the same way `workflowID` already implicitly reaches nodes: via a new prop on `nodeComponents`' consumers is not how React Flow works (custom node types only receive `NodeProps`) — instead, read it the same way `BaseNode`'s badge reads `selectedOutputNodeIdAtom`: add a matching read here.

Add the import:

```tsx
import { useAtomValue } from "jotai";
import { editorRunIdAtom } from "@/features/workflows/editor/store/atoms";
```

Wait — `runId` today is `Editor`'s local `useState`, not an atom, so node components (which only receive `NodeProps`, not arbitrary React context from `Editor`) have no way to read it. Fix this at the source: `Editor`'s `runId` state becomes an atom instead of local state, so both `Editor` (which still owns setting it) and every node dialog (which only needs to read it) can access it without prop drilling. This is a small amendment to Task 5's work:

In `src/features/workflows/editor/store/atoms.ts`, add one more atom (after `editorReadOnlyAtom`):

```ts
/**
 * The workflow's currently-active run, if any — set once Execute
 * resolves (see Editor's handleExecuteStart) or hydrated from a `?run=`
 * replay param (see Editor). An atom rather than Editor-local state so
 * node dialogs (VariablePicker) can read it without prop-drilling
 * through every node component, the same reasoning as
 * selectedOutputNodeIdAtom.
 */
export const editorRunIdAtom = atom<string | null>(null);
```

In `src/features/workflows/editor/components/editor.tsx`, replace the Task 5 `useState` with this atom. Find:

```tsx
  const [runId, setRunId] = useState<string | null>(null);
```

Replace with:

```tsx
  const [runId, setRunId] = useAtom(editorRunIdAtom);
```

Add `useAtom` to the existing `jotai` import (currently `import { useSetAtom } from "jotai";`) — change to:

```tsx
import { useAtom, useSetAtom } from "jotai";
```

And add `editorRunIdAtom` to the existing atoms import:

```tsx
import { editorAtom } from "../store/atoms";
```

becomes:

```tsx
import { editorAtom, editorRunIdAtom } from "../store/atoms";
```

`Editor`'s own usage of `runId` (passed to `<NodeOutputDrawer runId={runId} />`) needs no change — same variable name, same value, just atom-backed now.

Now, back in `ai-node.tsx`: add the import and read the atom inside `createAiNode`'s returned component:

```tsx
import { useAtomValue } from "jotai";
import { editorRunIdAtom } from "@/features/workflows/editor/store/atoms";
```

Inside the component body (alongside the existing `const { setNodes } = useReactFlow();`):

```tsx
    const runId = useAtomValue(editorRunIdAtom);
```

And pass both new props to `AiNodeDialog`:

```tsx
        <AiNodeDialog
          open={dialogOpen}
          onOpenChange={setDialogOpen}
          onSubmit={handleSubmit}
          defaultValues={nodeData}
          providerType={providerType}
          providerLabel={providerLabel}
          nodeId={props.id}
          runId={runId}
        />
```

- [ ] **Step 3: Repeat the same two field edits in `AgentNodeDialog`**

In `src/features/workflows/nodes/executions/components/agent/dialog.tsx`, apply the identical change as Step 1: add `nodeId: string; runId?: string | null;` to its `Props` interface, destructure them in the component signature, add `systemPromptCursor`/`userPromptCursor` state, and wrap the `systemPrompt`/`userPrompt` `FormField`s the same way (same `VariablePicker` usage, same `onSelect` handler on each `Textarea`). The field markup is otherwise identical to Step 1's — copy that exact pattern.

- [ ] **Step 4: `AgentNode` passes `nodeId`/`runId` through**

In `src/features/workflows/nodes/executions/components/agent/node.tsx`, add the same import and atom read as Step 2:

```tsx
import { useAtomValue } from "jotai";
import { editorRunIdAtom } from "@/features/workflows/editor/store/atoms";
```

Inside the component body:

```tsx
  const runId = useAtomValue(editorRunIdAtom);
```

Update the `<AgentNodeDialog>` render:

```tsx
      <AgentNodeDialog
        open={dialogOpen}
        onOpenChange={setDialogOpen}
        onSubmit={handleSubmit}
        defaultValues={data}
        nodeId={id}
        runId={runId}
      />
```

- [ ] **Step 5: Typecheck**

Run: `bunx tsc --noEmit`
Expected: same 5 pre-existing errors, no new ones.

- [ ] **Step 6: Manual verification**

Run `bun run dev:all`. Build a small workflow: Manual Trigger → HTTP Request (variable name `myHttp`, endpoint `https://jsonplaceholder.typicode.com/todos/1`) → an AI node (e.g. Gemini, with a saved credential). Open the AI node's dialog, click the braces icon next to User Prompt — confirm a popover lists `myHttp` with fallback paths (`httpResponse.status`, `httpResponse.statusText`, `httpResponse.data`) before ever running the workflow. Click one — confirm `{{myHttp.httpResponse.data}}` is inserted at the cursor. Execute the workflow, reopen the same dialog and picker — confirm the paths now reflect the *real* captured output shape for `myHttp` instead of the static fallback.

- [ ] **Step 7: Commit**

```bash
git add src/features/workflows/nodes/executions/components/ai/ai-dialog.tsx src/features/workflows/nodes/executions/components/ai/ai-node.tsx src/features/workflows/nodes/executions/components/agent/dialog.tsx src/features/workflows/nodes/executions/components/agent/node.tsx src/features/workflows/editor/store/atoms.ts src/features/workflows/editor/components/editor.tsx
git commit -m "feat: wire VariablePicker into AI and Agent node dialogs

Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>"
```

---

### Task 11: Wire `VariablePicker` into IF, Switch, and HTTP dialogs

**Files:**
- Modify: `src/features/workflows/nodes/executions/components/if/dialog.tsx` (`value`/`compareValue` fields, `Props`)
- Modify: `src/features/workflows/nodes/executions/components/if/if-node.tsx` (pass `nodeId`/`runId`)
- Modify: `src/features/workflows/nodes/executions/components/switch/dialog.tsx` (`value` field + each case field, `Props`)
- Modify: `src/features/workflows/nodes/executions/components/switch/switch-node.tsx` (pass `nodeId`/`runId`)
- Modify: `src/features/workflows/nodes/executions/components/http-request/dialog.tsx` (`endpoint`/`body` fields, `Props`)
- Modify: `src/features/workflows/nodes/executions/components/http-request/http-request-node.tsx` (pass `nodeId`/`runId`)

**Interfaces:**
- Consumes: `VariablePicker` (Task 9), `editorRunIdAtom` (Task 10).

- [ ] **Step 1: `IfNodeDialog`**

In `src/features/workflows/nodes/executions/components/if/dialog.tsx`, add imports:

```tsx
import { useState } from "react";
import { VariablePicker } from "../variable-picker";
```

(combine with the existing `import { useEffect } from "react";` into `import { useEffect, useState } from "react";`)

Extend `Props`:

```tsx
interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSubmit: (values: IfFormValues) => void;
  defaultValues?: Partial<IfFormValues>;
  nodeId: string;
  runId?: string | null;
}
```

Update the component signature:

```tsx
export const IfNodeDialog = ({
  open,
  onOpenChange,
  onSubmit,
  defaultValues = {},
  nodeId,
  runId,
}: Props) => {
```

Add cursor state after `form` is created:

```tsx
  const [valueCursor, setValueCursor] = useState(0);
  const [compareValueCursor, setCompareValueCursor] = useState(0);
```

Replace the `value` field's render:

```tsx
            <FormField
              control={form.control}
              name="value"
              render={({ field }) => (
                <FormItem>
                  <div className="flex items-center justify-between">
                    <FormLabel>Value</FormLabel>
                    <VariablePicker
                      nodeId={nodeId}
                      runId={runId}
                      value={field.value}
                      cursorPosition={valueCursor}
                      onInsert={field.onChange}
                    />
                  </div>
                  <FormControl>
                    <Input
                      {...field}
                      onSelect={(event) =>
                        setValueCursor(event.currentTarget.selectionStart ?? 0)
                      }
                      placeholder="{{myApiCall.httpResponse.data.status}}"
                    />
                  </FormControl>
                  <FormDescription>
                    The value to check. Reference an earlier node&apos;s output with{" "}
                    {"{{variableName.path.to.value}}"}.
                  </FormDescription>
                  <FormMessage />
                </FormItem>
              )}
            />
```

Replace the `compareValue` field's render:

```tsx
            {showCompareValue && (
              <FormField
                control={form.control}
                name="compareValue"
                render={({ field }) => (
                  <FormItem>
                    <div className="flex items-center justify-between">
                      <FormLabel>Compare To</FormLabel>
                      <VariablePicker
                        nodeId={nodeId}
                        runId={runId}
                        value={field.value ?? ""}
                        cursorPosition={compareValueCursor}
                        onInsert={field.onChange}
                      />
                    </div>
                    <FormControl>
                      <Input
                        {...field}
                        onSelect={(event) =>
                          setCompareValueCursor(event.currentTarget.selectionStart ?? 0)
                        }
                        placeholder="200"
                      />
                    </FormControl>
                    <FormDescription>
                      The value to compare against. Also supports {"{{variables}}"}.
                    </FormDescription>
                    <FormMessage />
                  </FormItem>
                )}
              />
            )}
```

- [ ] **Step 2: `IfNode` passes `nodeId`/`runId`**

In `src/features/workflows/nodes/executions/components/if/if-node.tsx`, add:

```tsx
import { useAtomValue } from "jotai";
import { editorRunIdAtom } from "@/features/workflows/editor/store/atoms";
```

Inside the component:

```tsx
  const runId = useAtomValue(editorRunIdAtom);
```

Update the `<IfNodeDialog>` render:

```tsx
      <IfNodeDialog
        open={dialogOpen}
        onOpenChange={setDialogOpen}
        onSubmit={handleSubmit}
        defaultValues={nodeData}
        nodeId={props.id}
        runId={runId}
      />
```

- [ ] **Step 3: `SwitchNodeDialog`**

In `src/features/workflows/nodes/executions/components/switch/dialog.tsx`, add imports:

```tsx
import { useState } from "react";
import { VariablePicker } from "../variable-picker";
```

(combine with existing `import { useEffect } from "react";`)

Extend `Props`:

```tsx
interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSubmit: (values: SwitchFormValues) => void;
  defaultValues?: Partial<SwitchFormValues>;
  nodeId: string;
  runId?: string | null;
}
```

Update the component signature to destructure `nodeId`/`runId`, and add cursor state after `form`/`fields` are set up:

```tsx
  const [valueCursor, setValueCursor] = useState(0);
```

Replace the top-level `value` field's render:

```tsx
            <FormField
              control={form.control}
              name="value"
              render={({ field }) => (
                <FormItem>
                  <div className="flex items-center justify-between">
                    <FormLabel>Value</FormLabel>
                    <VariablePicker
                      nodeId={nodeId}
                      runId={runId}
                      value={field.value}
                      cursorPosition={valueCursor}
                      onInsert={field.onChange}
                    />
                  </div>
                  <FormControl>
                    <Input
                      {...field}
                      onSelect={(event) =>
                        setValueCursor(event.currentTarget.selectionStart ?? 0)
                      }
                      placeholder="{{myApiCall.httpResponse.data.status}}"
                    />
                  </FormControl>
                  <FormDescription>
                    The value to match against each case below. Reference an earlier
                    node&apos;s output with {"{{variableName.path.to.value}}"}.
                  </FormDescription>
                  <FormMessage />
                </FormItem>
              )}
            />
```

The per-case `Input`s (inside the `fields.map(...)` block) keep manual typing for this task — each case is a short literal to match against (e.g. `"active"`), not a template expression referencing upstream data, so a picker there wouldn't earn its place. Leave that block unchanged.

- [ ] **Step 4: `SwitchNode` passes `nodeId`/`runId`**

Same pattern as Step 2, applied to `src/features/workflows/nodes/executions/components/switch/switch-node.tsx`: import `useAtomValue`/`editorRunIdAtom`, read `const runId = useAtomValue(editorRunIdAtom);`, and add `nodeId={props.id}` and `runId={runId}` to the `<SwitchNodeDialog>` render.

- [ ] **Step 5: `HttpRequestNodeDialog`**

In `src/features/workflows/nodes/executions/components/http-request/dialog.tsx`, add imports:

```tsx
import { useState } from "react";
import { VariablePicker } from "../variable-picker";
```

(combine with existing `import { useEffect } from "react";`)

Extend `Props`:

```tsx
interface Props {
    open: boolean,
    onOpenChange: (open: boolean) => void;
    onSubmit: (values: HttpRequestSubmitValues) => void;
    defaultValues?: Partial<HttpRequestData>;
    nodeId: string;
    runId?: string | null;
};
```

Update the component signature to destructure `nodeId`/`runId`, and add cursor state after `form`/`fields` are created:

```tsx
    const [endpointCursor, setEndpointCursor] = useState(0)
    const [bodyCursor, setBodyCursor] = useState(0)
```

Replace the `endpoint` field's render:

```tsx
                        <FormField
                            control={form.control}
                            name="endpoint"
                            render={({ field }) => (
                                <FormItem>
                                    <div className="flex items-center justify-between">
                                        <FormLabel>Endpoint URL</FormLabel>
                                        <VariablePicker
                                            nodeId={nodeId}
                                            runId={runId}
                                            value={field.value}
                                            cursorPosition={endpointCursor}
                                            onInsert={field.onChange}
                                        />
                                    </div>
                                    <FormControl>
                                        <Input
                                            {...field}
                                            onSelect={(event) =>
                                                setEndpointCursor(event.currentTarget.selectionStart ?? 0)
                                            }
                                            placeholder="https://api.example.com/users/{{httpResponse.data.id}}"
                                        />
                                    </FormControl>

                                    <FormDescription>
                                        Define the target API endpoint here. You can enter a static URL directly, or inject dynamic values using {"{ variables }"} for simple strings/numbers, and {"{ json variable }"} when you need to insert or stringify entire objects.

                                    </FormDescription>
                                    <FormMessage />
                                </FormItem>
                            )}
                        />
```

Replace the `body` field's render:

```tsx
                        {showBodyField && (
                            <FormField
                                control={form.control}
                                name="body"
                                render={({ field }) => (
                                    <FormItem>
                                        <div className="flex items-center justify-between">
                                            <FormLabel>Body</FormLabel>
                                            <VariablePicker
                                                nodeId={nodeId}
                                                runId={runId}
                                                value={field.value ?? ""}
                                                cursorPosition={bodyCursor}
                                                onInsert={field.onChange}
                                            />
                                        </div>
                                        <FormControl>
                                            <Textarea
                                                {...field}
                                                onSelect={(event) =>
                                                    setBodyCursor(event.currentTarget.selectionStart ?? 0)
                                                }
                                                placeholder={'{\n  \"name\": \"{{workflowData.userName}}\",\n  \"email\": \"{{workflowData.userEmail}}\",\n  \"role\": \"{{workflowData.userRole}}\",\n  \"status\": \"{{workflowData.userStatus}}\"\n}'}
                                                className="min-h-[120px] font-mono text-sm"
                                            />
                                        </FormControl>

                                        <FormDescription>
                                            Provide the request payload here. You can enter raw JSON, or inject dynamic values using {"{ variables }"} for simple strings/numbers, and {"{ json variable }"} when you need to insert or stringify entire objects.

                                        </FormDescription>
                                        <FormMessage />
                                    </FormItem>
                                )}
                            />
                        )}
```

- [ ] **Step 6: `HttpRequestNode` passes `nodeId`/`runId`**

Same pattern again, applied to `src/features/workflows/nodes/executions/components/http-request/http-request-node.tsx`: import `useAtomValue`/`editorRunIdAtom`, read `const runId = useAtomValue(editorRunIdAtom);`, and add `nodeId={props.id}` and `runId={runId}` to the `<HttpRequestNodeDialog>` render.

- [ ] **Step 7: Typecheck**

Run: `bunx tsc --noEmit`
Expected: same 5 pre-existing errors, no new ones.

- [ ] **Step 8: Full test suite**

Run: `bun test`
Expected: PASS, every test in the repo (this task doesn't add new automated tests — it's UI wiring identical in shape to Task 10 — but confirms nothing broke).

- [ ] **Step 9: Manual verification**

Run `bun run dev:all`. Open an IF node's dialog downstream of an HTTP Request node — confirm the picker appears next to both Value and Compare To. Open a Switch node's dialog — confirm the picker appears next to the top-level Value field only, not the per-case inputs. Open the HTTP Request dialog for a node downstream of another HTTP node — confirm the picker appears next to Endpoint URL and (once a POST/PUT/PATCH method is selected) Body.

- [ ] **Step 10: Commit**

```bash
git add src/features/workflows/nodes/executions/components/if/dialog.tsx src/features/workflows/nodes/executions/components/if/if-node.tsx src/features/workflows/nodes/executions/components/switch/dialog.tsx src/features/workflows/nodes/executions/components/switch/switch-node.tsx src/features/workflows/nodes/executions/components/http-request/dialog.tsx src/features/workflows/nodes/executions/components/http-request/http-request-node.tsx
git commit -m "feat: wire VariablePicker into IF, Switch, and HTTP Request dialogs

Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>"
```

---

### Task 12: Read-only replay mode (`?run=<id>`)

**Files:**
- Create: `src/features/workflows/editor/params.ts`
- Modify: `src/features/workflows/editor/components/editor.tsx` (full file)
- Modify: `src/features/workflows/nodes/workflow-node.tsx` (hide Settings/Delete in read-only mode)

**Interfaces:**
- Consumes: `editorRunIdAtom`/`editorReadOnlyAtom` (Tasks 6, 10), `trpc.executions.getById` (existing).

- [ ] **Step 1: The `run` search param**

Create `src/features/workflows/editor/params.ts`:

```ts
import { parseAsString } from "nuqs/server";

export const editorParams = {
  run: parseAsString.withOptions({ clearOnDefault: true }),
};
```

- [ ] **Step 2: `Editor` reads it, hydrates read-only state**

Replace the full contents of `src/features/workflows/editor/components/editor.tsx`:

```tsx
"use client";

import { ErrorView, LoadingView } from "@/components/dashboard";
import { useSuspenseWorkflow } from "@/features/workflows/hooks/use-workflows";
import { useAutosave } from "@/features/workflows/hooks/use-autosave";
import { useTheme } from "next-themes";
import { useState, useCallback, useMemo, useEffect } from "react";
import {
  ReactFlow,
  applyNodeChanges,
  applyEdgeChanges,
  addEdge,
  Background,
  Controls,
  MiniMap,
  Panel,
} from "@xyflow/react";
import type {
  Node,
  Edge,
  NodeChange,
  EdgeChange,
  Connection,
} from "@xyflow/react";
import "@xyflow/react/dist/style.css";
import { nodeComponents } from "@/features/workflows/nodes/node-components";
import { AddNodeButton } from "@/features/workflows/nodes/add-node-button";
import { useAtom, useSetAtom } from "jotai";
import { useQueryStates } from "nuqs";
import { useTRPC } from "@/trpc/client";
import { useQuery } from "@tanstack/react-query";
import {
  editorAtom,
  editorReadOnlyAtom,
  editorRunIdAtom,
  autosaveEnabledAtom,
} from "../store/atoms";
import { editorParams } from "../params";
import { NodeType } from "@/generated/prisma/enums";
import { ExecuteWorkflowButton } from "../../nodes/execute-workflow";
import { useWorkflowExecutionStatus } from "@/features/workflows/hooks/use-workflow-execution-status";
import { NodeOutputDrawer } from "./node-output-drawer";

export const EditorLoading = () => {
  return <LoadingView message="Loading Editor." />;
};
export const EditorError = () => {
  return <ErrorView message="Error Loading Editor" />;
};

export const Editor = ({ workflowID }: { workflowID: string }) => {

  const setEditor = useSetAtom(editorAtom)
  const { data: workflow } = useSuspenseWorkflow(workflowID);

  const [{ run: replayRunId }] = useQueryStates(editorParams);
  const readOnly = Boolean(replayRunId);
  const setReadOnly = useSetAtom(editorReadOnlyAtom);
  const setAutosaveEnabled = useSetAtom(autosaveEnabledAtom);
  const trpc = useTRPC();
  // A plain (non-suspense) query, deliberately: useSuspenseQuery has no
  // `enabled` option — suspense queries are always enabled by design, so
  // gating this fetch on "does a replay param exist" requires the regular
  // useQuery. On a normal (non-replay) visit this simply never fetches.
  const { data: replayRun } = useQuery({
    ...trpc.executions.getById.queryOptions({ id: replayRunId ?? "" }),
    enabled: Boolean(replayRunId),
  });

  const [nodes, setNodes] = useState<Node[]>(workflow.nodes);
  const [edges, setEdges] = useState<Edge[]>(workflow.edges);

  // Hydrate node status from the replay run once it loads — same pattern
  // as the live-status effect below (statusMessages), just fed from a
  // fetched run's steps instead of the realtime channel.
  useEffect(() => {
    if (!replayRun) return;
    const statusByNodeId = new Map(
      replayRun.steps.map((step) => [
        step.nodeId,
        step.status === "SUCCESS" ? "success" : step.status === "ERROR" ? "error" : "initial",
      ]),
    );
    setNodes((currentNodes) =>
      currentNodes.map((node) =>
        statusByNodeId.has(node.id)
          ? { ...node, data: { ...node.data, status: statusByNodeId.get(node.id) } }
          : node,
      ),
    );
  }, [replayRun]);

  // React Flow's Controls/MiniMap/Background ship their own light-oriented
  // default styling — colorMode applies xyflow's built-in dark theme class
  // instead of leaving them stuck light regardless of the app's theme.
  // `mounted` avoids a hydration mismatch, matching the same pattern
  // app-sidebar.tsx uses for its own theme toggle.
  const { resolvedTheme } = useTheme();
  const [mounted, setMounted] = useState(false);
  useEffect(() => {
    setMounted(true);
  }, []);

  useEffect(() => {
    // Unconditional both ways, not just "disable on entry": if this same
    // mounted Editor instance later navigates from a replay URL back to
    // the plain editor route (readOnly: true -> false) without a full
    // remount, autosave must re-enable — not stay silently off for the
    // rest of the session.
    setReadOnly(readOnly);
    setAutosaveEnabled(!readOnly);
  }, [readOnly, setReadOnly, setAutosaveEnabled]);

  const [runId, setRunId] = useAtom(editorRunIdAtom);
  useEffect(() => {
    if (replayRunId) setRunId(replayRunId);
  }, [replayRunId, setRunId]);

  // Autosave hook - saves after 1 second of inactivity. Still called
  // unconditionally (Rules of Hooks) — replay mode instead gates the
  // actual write via autosaveEnabledAtom, set false above.
  useAutosave({
    workflowId: workflowID,
    nodes,
    edges,
    delay: 1000,
  });

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

  const handleExecuteStart = useCallback((newRunId: string) => {
    setRunId(newRunId);
    setNodes((currentNodes) =>
      currentNodes.map((node) => ({ ...node, data: { ...node.data, status: "initial" } })),
    );
  }, [setRunId]);

  const onNodesChange = useCallback(
    (changes: NodeChange[]) =>
      setNodes((nodesSnapshot) =>
        applyNodeChanges(changes, nodesSnapshot),
      ),
    [],
  );
  const onEdgesChange = useCallback(
    (changes: EdgeChange[]) =>
      setEdges((edgesSnapshot) =>
        applyEdgeChanges(changes, edgesSnapshot),
      ),
    [],
  );
  const onConnect = useCallback(
    (params: Connection) =>
      setEdges((edgesSnapshot) => addEdge(params, edgesSnapshot)),
    [],
  );

  const hasManualTrigger = useMemo(() => {
    return nodes.some((node) => node.type === NodeType.MANUAL_TRIGGER)
  }, [nodes])

  return (
    <div className="size-full">
      <ReactFlow
        nodes={nodes}
        edges={edges}
        onNodesChange={onNodesChange}
        onEdgesChange={onEdgesChange}
        onConnect={onConnect}
        fitView
        proOptions={{
          hideAttribution: true,
        }}
        nodeTypes={nodeComponents}
        onInit={setEditor}
        colorMode={mounted && resolvedTheme === "dark" ? "dark" : "light"}
        snapGrid={[10, 10]}
        snapToGrid
        panOnScroll
        panOnDrag={false}
        selectionOnDrag
        nodesDraggable={!readOnly}
        nodesConnectable={!readOnly}
        edgesReconnectable={!readOnly}
      >
        <Background />
        <Controls />
        <MiniMap />
        {!readOnly && (
          <Panel position="top-right">
            <AddNodeButton />
          </Panel>
        )}
        {!readOnly && hasManualTrigger && (
          <Panel position="bottom-center">
            <ExecuteWorkflowButton workflowID={workflowID} onExecuteStart={handleExecuteStart} />
          </Panel>
        )}
      </ReactFlow>
      <NodeOutputDrawer runId={runId} />
    </div>
  );
};
```

A normal editor visit (no `run` param) leaves `replayRunId` as `null`; the `replayRun` query stays `enabled: false` and never fires a request, `readOnly` is `false`, and every behavior here is identical to before this task — status starts blank, `AddNodeButton`/`ExecuteWorkflowButton` render as always, autosave stays enabled.

- [ ] **Step 3: `WorkflowNode` hides its Settings/Delete toolbar in read-only mode**

In `src/features/workflows/nodes/workflow-node.tsx`, add the import:

```tsx
import { useAtomValue } from "jotai";
import { editorReadOnlyAtom } from "@/features/workflows/editor/store/atoms";
```

Find:

```tsx
export function WorkflowNode({
  children,
  showToolBar = true,
  onDelete,
  onSettings,
  name,
  description,
}: WorkflowNodeProps) {
  return (
    <>
      {showToolBar && (
```

Change to:

```tsx
export function WorkflowNode({
  children,
  showToolBar = true,
  onDelete,
  onSettings,
  name,
  description,
}: WorkflowNodeProps) {
  const readOnly = useAtomValue(editorReadOnlyAtom);
  return (
    <>
      {showToolBar && !readOnly && (
```

- [ ] **Step 4: Typecheck**

Run: `bunx tsc --noEmit`
Expected: same 5 pre-existing errors, no new ones.

- [ ] **Step 5: Full test suite**

Run: `bun test`
Expected: PASS, every test in the repo.

- [ ] **Step 6: Manual verification**

Run `bun run dev:all`. Execute a workflow, note its run's id (via Prisma Studio's `workflow_run` table, or the Inngest dev server's run list), then open `/workflows/<workflowID>?run=<runId>` directly. Confirm: node status badges are hydrated from that run (matching what the live run showed), the Settings/Delete toolbar doesn't appear on node hover/select, dragging a node does nothing, `AddNodeButton`/`ExecuteWorkflowButton` are gone, and clicking a badge still opens `NodeOutputDrawer` with that node's input/output. Then open the same workflow with no `?run=` param — confirm it's back to the normal editable experience with blank badges.

- [ ] **Step 7: Commit**

```bash
git add src/features/workflows/editor/params.ts src/features/workflows/editor/components/editor.tsx src/features/workflows/nodes/workflow-node.tsx
git commit -m "feat: add read-only replay mode via ?run= on the editor route

Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>"
```

---

### Task 13: Connect `/executions` to the replay view

**Files:**
- Modify: `src/features/executions/components/executions-list.tsx:120-124` (the existing workflow-name link)
- Modify: `src/features/executions/components/execution-detail-sheet.tsx` (add a link at the top of the sheet)

**Interfaces:**
- Consumes: replay mode's `?run=` param (Task 12).

- [ ] **Step 1: `ExecutionsList`'s existing link gains `?run=`**

In `src/features/executions/components/executions-list.tsx`, find:

```tsx
                <TableCell>
                  <Link
                    href={`/workflows/${run.workflowId}`}
                    className="hover:underline"
                    onClick={(event) => event.stopPropagation()}
                  >
                    {run.workflow.name}
                  </Link>
                </TableCell>
```

Change to:

```tsx
                <TableCell>
                  <Link
                    href={`/workflows/${run.workflowId}?run=${run.id}`}
                    className="hover:underline"
                    onClick={(event) => event.stopPropagation()}
                  >
                    {run.workflow.name}
                  </Link>
                </TableCell>
```

(Clicking anywhere else on the row still opens `ExecutionDetailSheet` as before — this only changes where the workflow-name link itself points.)

- [ ] **Step 2: `ExecutionDetailSheet` gets its own link to the same view**

In `src/features/executions/components/execution-detail-sheet.tsx`, add the import:

```tsx
import Link from "next/link";
import { Button } from "@/components/ui/button";
```

Find `ExecutionDetailContent`'s top-level return, specifically the status/duration row:

```tsx
      <div className="flex items-center gap-3">
        <Badge variant="outline" className={`gap-1.5 ${meta.className}`}>
          <meta.icon className="size-3.5" />
          {meta.label}
        </Badge>
        <span className="text-sm text-muted-foreground">
          Started {formatDistanceToNow(run.startedAt, { addSuffix: true })} · ran for{" "}
          {formatRunDuration(run.startedAt, run.completedAt)}
        </span>
      </div>
```

Change to (adding a link to the replay view right after it):

```tsx
      <div className="flex items-center gap-3">
        <Badge variant="outline" className={`gap-1.5 ${meta.className}`}>
          <meta.icon className="size-3.5" />
          {meta.label}
        </Badge>
        <span className="text-sm text-muted-foreground">
          Started {formatDistanceToNow(run.startedAt, { addSuffix: true })} · ran for{" "}
          {formatRunDuration(run.startedAt, run.completedAt)}
        </span>
      </div>
      <Button variant="outline" size="sm" asChild className="self-start">
        <Link href={`/workflows/${run.workflowId}?run=${run.id}`}>View in canvas</Link>
      </Button>
```

This needs `run.workflowId` on the query result — `executionsRouter.getById` already returns the full `WorkflowRun` row (which has `workflowId` as a plain scalar column) plus `workflow: { name: true }`, so no router change is needed; `run.workflowId` is already there.

- [ ] **Step 3: Typecheck**

Run: `bunx tsc --noEmit`
Expected: same 5 pre-existing errors, no new ones.

- [ ] **Step 4: Full test suite**

Run: `bun test`
Expected: PASS, every test in the repo — this is the last task in the plan, so this is also the final confirmation the whole feature's automated coverage (diffContext, run-workflow's recordStep integration, findAncestorVariables) is green.

- [ ] **Step 5: Manual verification**

Run `bun run dev:all`, execute a workflow, visit `/executions`, click the workflow name in the list — confirm it lands on `/workflows/<id>?run=<runId>` in read-only replay mode (per Task 12's verification). Go back to `/executions`, click anywhere else on that row to open the detail Sheet, and confirm the new "View in canvas" button also lands on the same replay view.

- [ ] **Step 6: Commit**

```bash
git add src/features/executions/components/executions-list.tsx src/features/executions/components/execution-detail-sheet.tsx
git commit -m "feat: link /executions rows into the read-only canvas replay view

Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>"
```

---

## Explicitly out of scope for this plan

- Re-running or retrying a single node from a past run.
- Editing a workflow's nodes/edges while viewing a past run (replay mode is view-only by design).
- Exporting execution data (JSON download, CSV, etc.).
- Any change to the actual variable-storage mechanism inside executors — investigated during design; it was already correct.
- A dedicated `getStep({runId, nodeId})` procedure — the drawer and picker both reuse the existing `getById`, which already returns every step in one query.
- An explicit "exit replay mode" control. Reaching replay mode always happens via a fresh navigation from `/executions` (a different route), which fully remounts the Editor — clean state either way. Manually editing the URL bar to strip `?run=` while staying on the same mounted Editor instance is not handled specially: `runId`/hydrated badges may stay stale until a real remount. Cosmetic only (no data is written in that state, since autosave re-enabling is handled correctly — see Task 12 Step 2's effect), not worth a dedicated control for v1.
