# Agent Node Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add an n8n-style tool-calling Agent node — one `AGENT` node type running a multi-step LLM loop that can call other canvas nodes (starting with HTTP Request) as tools via a new connection kind.

**Architecture:** Tool connections reuse the existing handle-ID convention already driving branch routing (no new DB column). Any node type becomes tool-usable by adding a generic `aiTool` config field to its data and a `toolCapable` flag to its canvas handles — the Agent's executor discovers connected tool nodes via `allConnections`, builds a zod-typed `tool()` per node from its `$fromAI`-style parameter list, and calls the tool node's real, unmodified executor with an ephemeral context. The whole tool loop is wrapped in one Inngest step (not per-tool-call) to avoid both an illegal nested-`step.run` call and a replay/non-determinism correctness risk.

**Tech Stack:** Next.js 16, tRPC 11, Prisma 7, `@xyflow/react` v12, Inngest 3.49.1, `ai@6.0.31` (`generateText`, `tool`, `stopWhen`/`stepCountIs`), zod 4, `react-hook-form` (`useFieldArray`), Bun test.

**Spec:** `docs/superpowers/specs/2026-08-16-agent-node-design.md`

## Global Constraints

- One `AGENT` `NodeType` enum value — no other schema changes. Tool connections are identified purely by handle-ID suffix (`-tool-target` / `-tool-source`), never a new DB column.
- All tool parameters are required (no optional/default-valued parameters) — matches the spec's explicit scope cut.
- `maxSteps` defaults to 5, is capped client-side at 15, and is clamped server-side to `[1, 15]` regardless of stored value.
- A tool node's own executor invocation must NOT go through Inngest's real `step` tool (nesting is illegal) — use the passthrough `{ run: (_name, fn) => fn() }` shape already established as `fakeStep` in `src/inngest/run-workflow.test.ts`, cast `as unknown as StepTools`.
- A tool invocation that throws becomes an error result fed back to the model (`{ error: string }`), never an aborted run — this is a deliberate, documented departure from every other node's fail-the-whole-run convention.
- No unit test file for the Agent executor's top-level `generateText`-calling orchestration — matches this codebase's existing convention of zero test coverage for `create-ai-executor.ts` (mocking the AI SDK's network layer was never done for the 4 existing AI nodes). All new *pure* logic (tool discovery, zod schema building) gets its own dedicated, fully-tested module instead.
- Every new/modified file matches this codebase's existing per-file conventions exactly (double-quote-free vs. double-quoted, `"use client"` placement, etc.) — copy the style of the nearest sibling file, not a fixed house style.

---

### Task 1: `AGENT` node type in the Prisma schema

**Files:**
- Modify: `prisma/schema.prisma` (the `NodeType` enum, currently lines 111-121)

**Interfaces:**
- Produces: `NodeType.AGENT` (from `@/generated/prisma/enums`), available to every later task.

- [ ] **Step 1: Add the enum value**

In `prisma/schema.prisma`, change:

```prisma
enum NodeType {
  INITIAL
  MANUAL_TRIGGER
  HTTP_REQUEST
  IF
  SWITCH
  OPENAI
  ANTHROPIC
  GEMINI
  GROQ
}
```

to:

```prisma
enum NodeType {
  INITIAL
  MANUAL_TRIGGER
  HTTP_REQUEST
  IF
  SWITCH
  OPENAI
  ANTHROPIC
  GEMINI
  GROQ
  AGENT
}
```

- [ ] **Step 2: Run the migration**

Run: `bunx prisma migrate dev --name add_agent_node_type`

Expected: succeeds non-interactively (adding an enum value is purely additive — no data-loss warning, unlike the earlier `@@unique` migration this session had to work around manually). This also regenerates `src/generated/prisma` — confirm `NodeType.AGENT` is present in `src/generated/prisma/enums.ts` afterward.

- [ ] **Step 3: Typecheck and commit**

Run: `bunx tsc --noEmit` — expect the same 8 pre-existing baseline errors (`src/app/page.tsx` x3, `src/components/ui/resizable.tsx` x5), 0 new.

```bash
git add prisma/schema.prisma prisma/migrations src/generated/prisma
git commit -m "feat: add AGENT node type"
```

---

### Task 2: Shared tool primitives — handle-ID helpers and the `AiToolConfig` type

**Files:**
- Create: `src/features/workflows/nodes/executions/lib/tool-connections.ts`
- Create: `src/features/workflows/nodes/executions/lib/tool-connections.test.ts`
- Create: `src/features/workflows/nodes/executions/lib/ai-tool.ts`

**Interfaces:**
- Produces: `toolTargetHandleId(nodeId: string): string`, `toolSourceHandleId(nodeId: string): string`, `isToolConnection(connection: { toInput: string | null }): boolean` — used by Task 3 (runWorkflow filtering), Task 4 (BaseExecutionNode), Task 6 (Agent's canvas component and executor).
- Produces: `AiToolParameter { name: string; type: "string" | "number" | "boolean"; description: string }` and `AiToolConfig { description: string; parameters: AiToolParameter[] }` — used by Task 4 (HTTP Request's data type + dialog) and Task 6/7 (Agent's tool-schema builder and executor).

This task has no dependency on Task 1 — it's a standalone, pure module.

- [ ] **Step 1: Write the failing tests**

Create `src/features/workflows/nodes/executions/lib/tool-connections.test.ts`:

```ts
import { describe, expect, test } from "bun:test";
import { isToolConnection, toolSourceHandleId, toolTargetHandleId } from "./tool-connections";

describe("tool-connections handle IDs", () => {
  test("toolTargetHandleId builds a stable, node-scoped id", () => {
    expect(toolTargetHandleId("agent-1")).toBe("agent-1-tool-target");
  });

  test("toolSourceHandleId builds a stable, node-scoped id", () => {
    expect(toolSourceHandleId("http-1")).toBe("http-1-tool-source");
  });
});

describe("isToolConnection", () => {
  test("true when toInput ends with -tool-target", () => {
    expect(isToolConnection({ toInput: "agent-1-tool-target" })).toBe(true);
  });

  test("false for a normal flow connection", () => {
    expect(isToolConnection({ toInput: "agent-1-target" })).toBe(false);
  });

  test("false for a branch connection's toInput", () => {
    expect(isToolConnection({ toInput: "main" })).toBe(false);
  });

  test("false when toInput is null", () => {
    expect(isToolConnection({ toInput: null })).toBe(false);
  });
});
```

- [ ] **Step 2: Run to verify it fails**

Run: `bun test src/features/workflows/nodes/executions/lib/tool-connections.test.ts`
Expected: FAIL — `Cannot find module './tool-connections'` (file doesn't exist yet).

- [ ] **Step 3: Implement**

Create `src/features/workflows/nodes/executions/lib/tool-connections.ts`:

```ts
/**
 * Tool connections (an Agent node calling another node as a tool) reuse the
 * same handle-ID convention that already drives branch routing (IF/Switch's
 * `${nodeId}-${branch}-source`) — no new DB column. A connection whose
 * `toInput` ends with "-tool-target" is a tool connection, not a flow
 * connection; runWorkflow excludes these from its topological sort and
 * reachability walk entirely (see run-workflow.ts).
 */

export function toolTargetHandleId(nodeId: string): string {
  return `${nodeId}-tool-target`;
}

export function toolSourceHandleId(nodeId: string): string {
  return `${nodeId}-tool-source`;
}

export function isToolConnection(connection: { toInput: string | null }): boolean {
  return connection.toInput?.endsWith("-tool-target") ?? false;
}
```

Create `src/features/workflows/nodes/executions/lib/ai-tool.ts`:

```ts
/**
 * Any node type becomes usable as an Agent's tool by carrying this shape on
 * its `data.aiTool` field, and by declaring itself `toolCapable` on its
 * canvas component (see base-execution-node.tsx). HTTP Request is the only
 * node wired up to this so far (Task 4 of this plan) — the shape itself is
 * generic so future node types opt in without any redesign.
 */
export interface AiToolParameter {
  name: string;
  type: "string" | "number" | "boolean";
  description: string;
}

export interface AiToolConfig {
  description: string;
  parameters: AiToolParameter[];
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `bun test src/features/workflows/nodes/executions/lib/tool-connections.test.ts`
Expected: PASS, 6 tests.

- [ ] **Step 5: Commit**

```bash
git add src/features/workflows/nodes/executions/lib/tool-connections.ts src/features/workflows/nodes/executions/lib/tool-connections.test.ts src/features/workflows/nodes/executions/lib/ai-tool.ts
git commit -m "feat: shared tool-connection handle-ID helpers and AiToolConfig type"
```

---

### Task 3: Thread `getExecutor`/`allNodes`/`allConnections` into `NodeExecutorParams`

**Files:**
- Modify: `src/features/workflows/nodes/executions/types.ts`
- Modify: `src/inngest/run-workflow.ts`
- Modify: `src/inngest/run-workflow.test.ts`

**Interfaces:**
- Consumes: nothing from earlier tasks in this plan.
- Produces: `NodeExecutorParams` gains `getExecutor: (type: NodeType) => NodeExecutor`, `allNodes: Node[]`, `allConnections: Connection[]` — every executor's params type, used by Task 7 (Agent's executor) to discover and invoke tool nodes.

This task only threads the values through uniformly (exactly like `userId`/`step` already are) — it does NOT yet change reachability/topological-sort behavior. That's Task 4.

- [ ] **Step 1: Write the failing test**

In `src/inngest/run-workflow.test.ts`, add this test at the end of the `describe("runWorkflow", ...)` block (before the closing `});`):

```ts
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
```

- [ ] **Step 2: Run to verify it fails**

Run: `bun test src/inngest/run-workflow.test.ts`
Expected: FAIL — `seen` entries are missing/undefined fields, or a TypeScript error on `getExecutor`/`allNodes`/`allConnections` not existing on the executor's params (depending on strictness, this may fail at the type level rather than the assertion — either way it fails).

- [ ] **Step 3: Implement**

In `src/features/workflows/nodes/executions/types.ts`, change:

```ts
import type { GetStepTools, Inngest } from "inngest";

export type WorkflowContext = Record<string, unknown>;

export type StepTools = GetStepTools<Inngest.Any>;

export interface NodeExecutorParams<TData = Record<string, unknown>> {
  data: TData;
  nodeId: string;
  context: WorkflowContext;
  step: StepTools;
  /**
   * The workflow owner's id. Sourced by runWorkflow from the trusted,
   * DB-loaded Workflow.userId column — never from node/workflow data,
   * template-resolved context, or anything else workflow-author-controlled.
   * Executors that look up a user's saved credential (e.g. an AI provider
   * API key) must scope that lookup by this id.
   */
  userId: string;
  // publish : ADD real time later
}
```

to:

```ts
import type { Connection, Node } from "@/generated/prisma/client";
import type { NodeType } from "@/generated/prisma/enums";
import type { GetStepTools, Inngest } from "inngest";

export type WorkflowContext = Record<string, unknown>;

export type StepTools = GetStepTools<Inngest.Any>;

export interface NodeExecutorParams<TData = Record<string, unknown>> {
  data: TData;
  nodeId: string;
  context: WorkflowContext;
  step: StepTools;
  /**
   * The workflow owner's id. Sourced by runWorkflow from the trusted,
   * DB-loaded Workflow.userId column — never from node/workflow data,
   * template-resolved context, or anything else workflow-author-controlled.
   * Executors that look up a user's saved credential (e.g. an AI provider
   * API key) must scope that lookup by this id.
   */
  userId: string;
  /**
   * The full executor registry lookup, threaded down uniformly like
   * `step`/`userId` — only the Agent executor uses this, to invoke a
   * connected tool node's real executor. Every other executor receives it
   * but has no reason to call it.
   */
  getExecutor: (type: NodeType) => NodeExecutor;
  /**
   * The workflow's complete node/connection lists — same rationale as
   * `getExecutor`. The Agent executor filters `allConnections` for
   * connections into its own tool-target handle to discover which of
   * `allNodes` are wired to it as tools.
   */
  allNodes: Node[];
  allConnections: Connection[];
}
```

In `src/inngest/run-workflow.ts`, change the executor call inside the loop from:

```ts
      result = await executor({
        data: node.data as Record<string, unknown>,
        nodeId: node.id,
        context,
        step,
        userId,
      });
```

to:

```ts
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
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `bun test src/inngest/run-workflow.test.ts`
Expected: PASS, 10 tests (9 existing + this new one).

Run: `bunx tsc --noEmit` — same 8 pre-existing baseline errors, 0 new (every existing executor's params type now includes the two new required fields, but since executors destructure only the fields they use, e.g. `async ({ nodeId, context }) => {...}`, this compiles fine without touching any of the 8 existing executor files).

- [ ] **Step 5: Commit**

```bash
git add src/features/workflows/nodes/executions/types.ts src/inngest/run-workflow.ts src/inngest/run-workflow.test.ts
git commit -m "feat: thread getExecutor/allNodes/allConnections through NodeExecutorParams"
```

---

### Task 4: `runWorkflow` excludes tool connections from the main graph

**Files:**
- Modify: `src/inngest/run-workflow.ts`
- Modify: `src/inngest/run-workflow.test.ts`

**Interfaces:**
- Consumes: `isToolConnection` from `src/features/workflows/nodes/executions/lib/tool-connections.ts` (Task 2).
- Produces: nothing new consumed by later tasks — this is runWorkflow's internal correctness fix.

Without this task, a node wired ONLY as a tool (no flow connection at all) would be wrongly treated as a "root" node and executed directly by the main loop, in addition to being callable as a tool — because `runWorkflow`'s existing reachability seed is "every node with no inbound edge." This task fixes that.

- [ ] **Step 1: Write the failing tests**

In `src/inngest/run-workflow.test.ts`, add these two tests at the end of the `describe("runWorkflow", ...)` block:

```ts
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
```

`makeConnection` needs a 4th, optional `toInput` parameter to build these — update its definition (near the top of the file) from:

```ts
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
```

to:

```ts
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
```

- [ ] **Step 2: Run to verify they fail**

Run: `bun test src/inngest/run-workflow.test.ts`
Expected: FAIL — the first new test sees `calls` containing `"tool"` (it wrongly auto-executes as a root); the second sees `calls` containing `"tool"` too, or in the wrong position.

- [ ] **Step 3: Implement**

In `src/inngest/run-workflow.ts`, add the import and change the body:

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
import { workflowRunChannel } from "./channels/workflow-run";
import { topologicalSort } from "./utils";
```

Change the body of `runWorkflow` from:

```ts
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
```

to:

```ts
  // Tool connections (an Agent node calling another node as a tool) are
  // metadata for the Agent's own executor to discover, not part of the
  // linear execution graph — excluded here so a tool-only node (no flow
  // connection at all) is never treated as a "root" node and auto-executed
  // by the main loop in addition to being callable as a tool.
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

  // `hasInbound` intentionally checks ALL connections, not just
  // `flowConnections` — a node that's the *target* of a tool connection
  // (e.g. an Agent with no flow inbound at all, only a tool node feeding
  // into it) already has "some" incoming connection and must not be
  // treated as an unconnected root either. `toolNodeIds` alone only
  // excludes the tool's *source*; it says nothing about the tool
  // connection's *target*. Using `flowConnections` here would leave that
  // target node wrongly seeded as reachable.
  const hasInbound = new Set(connections.map((connection) => connection.toNodeId));
  const reachable = new Set(
    sortedNodes
      .filter((node) => !hasInbound.has(node.id) && !toolNodeIds.has(node.id))
      .map((node) => node.id),
  );
```

**Post-implementation correction (verified during Task 4's review):** the snippet above originally read `flowConnections.map(...)` for `hasInbound`, which fails the plan's own Step 1 Test 1 — a node with *only* a tool connection pointing into it (no flow connection at all) would slip through and wrongly get seeded as reachable, since `flowConnections` excludes tool connections entirely and `toolNodeIds` only tracks the tool's source, not its target. Fixed to build `hasInbound` from unfiltered `connections`, verified against both of Step 1's tests plus the fan-in edge case (a node with a real flow inbound that's *also* separately wired as a tool for another node — excluded from the seed via its genuine flow inbound either way, no double-counting, and it still becomes reachable normally once the flow graph reaches it).

- [ ] **Step 4: Run tests to verify they pass**

Run: `bun test src/inngest/run-workflow.test.ts`
Expected: PASS, 12 tests (10 from Task 3 + these 2).

Run: `bunx tsc --noEmit` — same 8 pre-existing baseline errors, 0 new.

- [ ] **Step 5: Commit**

```bash
git add src/inngest/run-workflow.ts src/inngest/run-workflow.test.ts
git commit -m "feat: exclude tool connections from runWorkflow's main execution graph"
```

---

### Task 5: HTTP Request becomes tool-capable

**Files:**
- Modify: `src/features/workflows/nodes/executions/components/base-execution-node.tsx`
- Modify: `src/features/workflows/nodes/executions/components/http-request/executor.ts`
- Modify: `src/features/workflows/nodes/executions/components/http-request/http-request-node.tsx`
- Modify: `src/features/workflows/nodes/executions/components/http-request/dialog.tsx`

**Interfaces:**
- Consumes: `toolSourceHandleId` from `src/features/workflows/nodes/executions/lib/tool-connections.ts`, `AiToolConfig`/`AiToolParameter` from `src/features/workflows/nodes/executions/lib/ai-tool.ts` (Task 2).
- Produces: `BaseExecutionNode`'s new `toolCapable?: boolean` prop — any future tool-capable node type passes this the same way. `HttpRequestData`'s new `aiTool?: AiToolConfig` field — read by Task 7's tool discovery.

- [ ] **Step 1: `BaseExecutionNode` gains `toolCapable`**

In `src/features/workflows/nodes/executions/components/base-execution-node.tsx`, add the import and prop, and render the extra handle only when `toolCapable` is true:

```tsx
"use client"

import { type NodeProps, Position, useReactFlow } from "@xyflow/react"

import type { LucideIcon } from "lucide-react"

import { memo, type ReactNode } from "react"

import { BaseNode, BaseNodeContent } from "../../react-flow/base-node"
import { BaseHandle } from "../../react-flow/base-handle"
import { WorkflowNode } from "../../workflow-node"
import { NodeStatus, NodeStatusIndicator } from "../../react-flow/status-indicator"
import { NodeIcon } from "../../node-icon"
import { toolSourceHandleId } from "../lib/tool-connections"
interface BaseExecutionNodeProps extends NodeProps {
    icon: LucideIcon | string;
    name: string;
    description?: string;
    children?: ReactNode;
    status?: NodeStatus;
    /** Renders a second source handle (bottom) an Agent node can wire into as a tool. */
    toolCapable?: boolean;
    onSetting?: () => void;
    onDoubleClick?: () => void;
}

export const BaseExecutionNode = memo(
    ({
        id,
        icon: Icon,
        name,
        children,
        status = "initial",
        description,
        toolCapable = false,
        onSetting,
        onDoubleClick
    }: BaseExecutionNodeProps) => {

        const { setNodes, setEdges } = useReactFlow()
        const handleDelete = () => {
            setNodes((currentNodes) => {
                const updatedNodes = currentNodes.filter((node) => node.id !== id);
                return updatedNodes;
            });

            setEdges((currentEdges) => {
                const updatedEdges = currentEdges.filter((edge) => edge.source !== id && edge.target !== id)
                return updatedEdges;
            });

        }
        return (
            <WorkflowNode
                name={name}
                description={description}
                onDelete={handleDelete}
                onSettings={onSetting}
            >
                <NodeStatusIndicator
                    status={status}
                    variant="border"

                >


                    <BaseNode status={status} onDoubleClick={onDoubleClick}>
                        <BaseNodeContent>
                            <NodeIcon icon={Icon} label={name} className="size-4 text-muted-foreground" imageSize={16} />
                            {children}
                            <BaseHandle
                                id={`${id}-target`}
                                type="target"
                                position={Position.Left}
                            />
                            <BaseHandle
                                id={`${id}-source`}
                                type="source"
                                position={Position.Right}
                            />
                            {toolCapable && (
                                <BaseHandle
                                    id={toolSourceHandleId(id)}
                                    type="source"
                                    position={Position.Bottom}
                                    title="Use as an AI tool"
                                />
                            )}
                        </BaseNodeContent>
                    </BaseNode>
                </NodeStatusIndicator>
            </WorkflowNode>
        )
    });

BaseExecutionNode.displayName = "BaseExecutionNode";
```

- [ ] **Step 2: `HttpRequestData` gains `aiTool`**

In `src/features/workflows/nodes/executions/components/http-request/executor.ts`, change:

```ts
import { NonRetriableError } from "inngest";
import ky, { type Options as KyOps } from "ky";
import { NodeExecutor } from "../../../executions/types";
import { resolveTemplate } from "../../lib/resolve-template";

type HttpRequestData = {
  variableName?: string;
  endpoint?: string;
  method?: "GET" | "PUT" | "POST" | "PATCH" | "DELETE";
  body?: string;
};
```

to:

```ts
import { NonRetriableError } from "inngest";
import ky, { type Options as KyOps } from "ky";
import { NodeExecutor } from "../../../executions/types";
import type { AiToolConfig } from "../../lib/ai-tool";
import { resolveTemplate } from "../../lib/resolve-template";

export type HttpRequestData = {
  variableName?: string;
  endpoint?: string;
  method?: "GET" | "PUT" | "POST" | "PATCH" | "DELETE";
  body?: string;
  /** Set when this node is configured as a callable Agent tool (Task 7 reads this). */
  aiTool?: AiToolConfig;
};
```

(The rest of `executor.ts` — validation, the `step.run` call — is unchanged; `aiTool` is read only by the Agent's own executor, never by `HttpRequestExecutor` itself. Note the type is now exported — it wasn't before — so the dialog and node component can import it in the next steps instead of re-declaring it.)

- [ ] **Step 3: `HttpRequestNode` passes `toolCapable`**

In `src/features/workflows/nodes/executions/components/http-request/http-request-node.tsx`, remove the now-redundant local type (import the exported one from the executor instead) and pass the new prop:

```tsx
"use client"

import { Node, NodeProps, useReactFlow } from "@xyflow/react"

import { GlobeIcon } from "lucide-react"
import { memo, useState } from "react";
import type { NodeStatus } from "../../../react-flow/status-indicator";
import { BaseExecutionNode } from "../base-execution-node";
import type { HttpRequestData } from "./executor";
import { HttpRequestNodeDialog, type HttpRequestSubmitValues } from "./dialog";

type HttpRequestNodeType = Node<HttpRequestData>;

export const HttpRequestNode = memo((props: NodeProps<HttpRequestNodeType>) => {

    const { setNodes } = useReactFlow()



    const [dialogOpen, setDialogOpen] = useState(false)
    const handleOpenSettings = () => setDialogOpen(true)

    const handleSubmit = (values: HttpRequestSubmitValues) => {
        setNodes((nodes) => nodes.map((node => {
            if (node.id === props.id) {
                return {
                    ...node,
                    data: {
                        ...node.data,
                        ...values
                    }
                }
            }
            return node
        })))
    }

    const nodeStatus = ((props.data as Record<string, unknown>)?.status as NodeStatus) ?? "initial"
    const nodeData = props.data;
    const description = nodeData?.endpoint
        ? `${nodeData.method || "GET"}: ${nodeData.endpoint}`
        : "Not Configured"

    return (
        <>
            <HttpRequestNodeDialog
                open={dialogOpen}
                onOpenChange={setDialogOpen}
                onSubmit={handleSubmit}
                defaultValues={nodeData}
            />
            <BaseExecutionNode
                {...props}
                id={props.id}
                icon={GlobeIcon}
                name="HTTP Request"
                description={description}
                status={nodeStatus}
                toolCapable
                onSetting={handleOpenSettings}
                onDoubleClick={handleOpenSettings}
            />
        </>
    )
})

HttpRequestNode.displayName = "HttpRequestNode";
```

`HttpRequestSubmitValues` is the shape the dialog actually calls `onSubmit` with (defined in the next step) — the *persisted* shape, matching `HttpRequestData` (`variableName`/`endpoint`/`method`/`body`/`aiTool`), not the dialog's own flat internal form shape (`HttpRequestFormValues`, which has `aiToolEnabled`/`aiToolDescription`/`aiToolParameters` instead of a nested `aiTool`). `handleSubmit` here just spreads `values` onto `node.data`, so it must be typed against what it's actually called with.

- [ ] **Step 4: HTTP Request's dialog gains the "Use as AI Tool" section**

Rewrite `src/features/workflows/nodes/executions/components/http-request/dialog.tsx` in full:

```tsx
"use client"

import {
    Dialog,
    DialogContent,
    DialogDescription,
    DialogFooter,
    DialogHeader,
    DialogTitle,
} from "@/components/ui/dialog"
import { Checkbox } from "@/components/ui/checkbox"
import z from "zod";
import type { AiToolConfig } from "../../lib/ai-tool";
import type { HttpRequestData } from "./executor";

const aiToolParameterSchema = z.object({
    name: z.string()
        .min(1, "Parameter name is required")
        .regex(/^[A-Za-z_$][A-Za-z0-9_$]*$/, "Parameter name must start with a letter or an underscore and contain only letters, numbers, and underscores"),
    type: z.enum(["string", "number", "boolean"]),
    description: z.string().min(1, "Description is required"),
});

const formSchema = z.object({
    variableName: z.string()
        .min(1, "variable name is required")
        .regex(/^[A-Za-z_$][A-Za-z0-9_$]*$/, "variable name must start with a letter or an underscore and contain only letters, numbers, and underscores"),
    endpoint: z.url("Please enter a valid url"),
    method: z.enum(["GET", "POST", "PUT", "PATCH", "DELETE"]),
    body: z.string()
        .optional(),
    aiToolEnabled: z.boolean(),
    aiToolDescription: z.string().optional(),
    aiToolParameters: z.array(aiToolParameterSchema),
}).refine(
    (data) => !data.aiToolEnabled || Boolean(data.aiToolDescription?.trim()),
    { message: "Tool description is required when \"Use as AI Tool\" is enabled", path: ["aiToolDescription"] },
)
export type HttpRequestFormValues = z.infer<typeof formSchema>

/** The shape actually persisted onto the node's data — `onSubmit` receives this, not the flat form shape above. */
export interface HttpRequestSubmitValues {
    variableName: string;
    endpoint: string;
    method: "GET" | "POST" | "PUT" | "PATCH" | "DELETE";
    body?: string;
    aiTool?: AiToolConfig;
}

interface Props {
    open: boolean,
    onOpenChange: (open: boolean) => void;
    onSubmit: (values: HttpRequestSubmitValues) => void;
    defaultValues?: Partial<HttpRequestData>;
};
import {
    Form,
    FormControl,
    FormDescription,
    FormField,
    FormItem,
    FormLabel,
    FormMessage,
} from "@/components/ui/form"

import {
    Select,
    SelectContent,
    SelectItem,
    SelectTrigger,
    SelectValue,
} from "@/components/ui/select"

import { Textarea } from "@/components/ui/textarea";
import { zodResolver } from "@hookform/resolvers/zod";
import { useFieldArray, useForm } from "react-hook-form"
import { useEffect } from "react";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { PlusIcon, TrashIcon } from "lucide-react";

function toFormDefaults(data: Partial<HttpRequestData> = {}): HttpRequestFormValues {
    return {
        variableName: data.variableName || "",
        endpoint: data.endpoint || "",
        method: data.method || "GET",
        body: data.body || "",
        aiToolEnabled: Boolean(data.aiTool),
        aiToolDescription: data.aiTool?.description || "",
        aiToolParameters: data.aiTool?.parameters || [],
    };
}

export const HttpRequestNodeDialog = ({
    open,
    onOpenChange,
    onSubmit,
    defaultValues = {}

}: Props) => {
    const form = useForm<HttpRequestFormValues>({
        resolver: zodResolver(formSchema),
        defaultValues: toFormDefaults(defaultValues),
    })

    const { fields, append, remove } = useFieldArray({
        control: form.control,
        name: "aiToolParameters",
    });

    useEffect(() => {
        if (open) {
            form.reset(toFormDefaults(defaultValues))
        }
    }, [open, defaultValues, form])

    const watchVariableName = form.watch("variableName") || "myApiCall"

    const watchMethod = form.watch("method")
    const showBodyField = ["POST", "PUT", "PATCH"].includes(watchMethod)

    const watchAiToolEnabled = form.watch("aiToolEnabled")

    const handleSubmit = (values: HttpRequestFormValues) => {
        const { aiToolEnabled, aiToolDescription, aiToolParameters, ...rest } = values;
        onSubmit({
            ...rest,
            aiTool: aiToolEnabled
                ? { description: aiToolDescription ?? "", parameters: aiToolParameters }
                : undefined,
        });
        onOpenChange(false)
    }


    return (
        <Dialog open={open} onOpenChange={onOpenChange}>
            <DialogContent>
                <DialogHeader>
                    <DialogTitle>HTTP</DialogTitle>
                    <DialogDescription>
                        Configure the settings for HTTP requests.
                    </DialogDescription>
                </DialogHeader>
                <Form {...form}>
                    <form
                        onSubmit={form.handleSubmit(handleSubmit)}
                        className="space-y-8 mt-4"
                    >
                        <FormField
                            control={form.control}
                            name="variableName"
                            render={({ field }) => (
                                <FormItem>
                                    <FormLabel>Variable Name</FormLabel>
                                    <FormControl>
                                        <Input
                                            {...field}
                                            placeholder="myApiCall"
                                        />
                                    </FormControl>

                                    <FormDescription>
                                        Use this name to reference the result in other nodes: {" "}
                                        {`{{${watchVariableName}.httpResponse.data}}`}

                                    </FormDescription>
                                    <FormMessage />
                                </FormItem>
                            )}
                        />
                        <FormField
                            control={form.control}
                            name="method"
                            render={({ field }) => (
                                <FormItem>
                                    <FormLabel>Method</FormLabel>
                                    <Select onValueChange={field.onChange} defaultValue={field.value}>
                                        <FormControl>
                                            <SelectTrigger className="w-full">
                                                <SelectValue placeholder="Select a method" />

                                            </SelectTrigger>
                                        </FormControl>
                                        <SelectContent>
                                            <SelectItem value="GET">GET</SelectItem>
                                            <SelectItem value="POST">POST</SelectItem>
                                            <SelectItem value="PUT">PUT</SelectItem>
                                            <SelectItem value="PATCH">PATCH</SelectItem>
                                            <SelectItem value="DELETE">DELETE</SelectItem>
                                        </SelectContent>
                                    </Select>
                                    <FormDescription>
                                        HTTP method for this request
                                    </FormDescription>
                                    <FormMessage />
                                </FormItem>
                            )}
                        />
                        <FormField
                            control={form.control}
                            name="endpoint"
                            render={({ field }) => (
                                <FormItem>
                                    <FormLabel>Endpoint URL</FormLabel>
                                    <FormControl>
                                        <Input
                                            {...field}
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
                        {showBodyField && (
                            <FormField
                                control={form.control}
                                name="body"
                                render={({ field }) => (
                                    <FormItem>
                                        <FormLabel>Body</FormLabel>
                                        <FormControl>
                                            <Textarea
                                                {...field}
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
                        <FormField
                            control={form.control}
                            name="aiToolEnabled"
                            render={({ field }) => (
                                <FormItem className="flex flex-row items-start gap-3 rounded-md border p-3">
                                    <FormControl>
                                        <Checkbox checked={field.value} onCheckedChange={field.onChange} />
                                    </FormControl>
                                    <div className="space-y-1 leading-none">
                                        <FormLabel>Use as AI Tool</FormLabel>
                                        <FormDescription>
                                            Let an Agent node call this HTTP Request with arguments it decides at runtime.
                                        </FormDescription>
                                    </div>
                                </FormItem>
                            )}
                        />
                        {watchAiToolEnabled && (
                            <>
                                <FormField
                                    control={form.control}
                                    name="aiToolDescription"
                                    render={({ field }) => (
                                        <FormItem>
                                            <FormLabel>Tool Description</FormLabel>
                                            <FormControl>
                                                <Textarea
                                                    {...field}
                                                    placeholder="Looks up the current weather for a city"
                                                    className="min-h-[60px]"
                                                />
                                            </FormControl>
                                            <FormDescription>
                                                Shown to the model so it knows when to call this tool.
                                            </FormDescription>
                                            <FormMessage />
                                        </FormItem>
                                    )}
                                />
                                <div className="space-y-3">
                                    <FormLabel>Parameters</FormLabel>
                                    <FormDescription>
                                        Each parameter becomes available in the fields above as {"{{ $fromAI.paramName }}"}. The model fills these in at call time.
                                    </FormDescription>
                                    {fields.map((field, index) => (
                                        <div key={field.id} className="flex items-start gap-2 rounded-md border p-3">
                                            <div className="flex-1 space-y-2">
                                                <FormField
                                                    control={form.control}
                                                    name={`aiToolParameters.${index}.name`}
                                                    render={({ field }) => (
                                                        <FormItem>
                                                            <FormControl>
                                                                <Input {...field} placeholder="city" />
                                                            </FormControl>
                                                            <FormMessage />
                                                        </FormItem>
                                                    )}
                                                />
                                                <FormField
                                                    control={form.control}
                                                    name={`aiToolParameters.${index}.type`}
                                                    render={({ field }) => (
                                                        <FormItem>
                                                            <Select onValueChange={field.onChange} defaultValue={field.value}>
                                                                <FormControl>
                                                                    <SelectTrigger className="w-full">
                                                                        <SelectValue />
                                                                    </SelectTrigger>
                                                                </FormControl>
                                                                <SelectContent>
                                                                    <SelectItem value="string">string</SelectItem>
                                                                    <SelectItem value="number">number</SelectItem>
                                                                    <SelectItem value="boolean">boolean</SelectItem>
                                                                </SelectContent>
                                                            </Select>
                                                            <FormMessage />
                                                        </FormItem>
                                                    )}
                                                />
                                                <FormField
                                                    control={form.control}
                                                    name={`aiToolParameters.${index}.description`}
                                                    render={({ field }) => (
                                                        <FormItem>
                                                            <FormControl>
                                                                <Input {...field} placeholder="The city to look up" />
                                                            </FormControl>
                                                            <FormMessage />
                                                        </FormItem>
                                                    )}
                                                />
                                            </div>
                                            <Button
                                                type="button"
                                                variant="ghost"
                                                size="icon"
                                                onClick={() => remove(index)}
                                                aria-label="Remove parameter"
                                            >
                                                <TrashIcon className="size-4" />
                                            </Button>
                                        </div>
                                    ))}
                                    <Button
                                        type="button"
                                        variant="outline"
                                        size="sm"
                                        onClick={() => append({ name: "", type: "string", description: "" })}
                                    >
                                        <PlusIcon className="size-4" />
                                        Add parameter
                                    </Button>
                                </div>
                            </>
                        )}
                        <DialogFooter className="mt-4">
                            <Button className="w-full" type="submit">Save</Button>
                        </DialogFooter>
                    </form>
                </Form>
            </DialogContent>
        </Dialog>
    )
}
```

`src/components/ui/checkbox.tsx` already exists in this repo — no `shadcn add` needed.

- [ ] **Step 5: Typecheck and run the full suite**

Run: `bunx tsc --noEmit` — same 8 pre-existing baseline errors, 0 new.
Run: `bun test` — all existing tests still pass (this task adds no new `.test.ts` file — dialog/canvas wiring has no automated coverage, matching this codebase's existing convention).

- [ ] **Step 6: Commit**

```bash
git add src/features/workflows/nodes/executions/components/base-execution-node.tsx src/features/workflows/nodes/executions/components/http-request/executor.ts src/features/workflows/nodes/executions/components/http-request/http-request-node.tsx src/features/workflows/nodes/executions/components/http-request/dialog.tsx
git commit -m "feat: HTTP Request node becomes usable as an Agent tool"
```

---

### Task 6: Agent's pure helpers — tool-schema builder and tool discovery

**Files:**
- Create: `src/features/workflows/nodes/executions/components/agent/tool-schema.ts`
- Create: `src/features/workflows/nodes/executions/components/agent/tool-schema.test.ts`
- Create: `src/features/workflows/nodes/executions/components/agent/discover-tools.ts`
- Create: `src/features/workflows/nodes/executions/components/agent/discover-tools.test.ts`

**Interfaces:**
- Consumes: `AiToolParameter`/`AiToolConfig` from `../../lib/ai-tool` (Task 2), `toolTargetHandleId` from `../../lib/tool-connections` (Task 2).
- Produces: `buildToolInputSchema(parameters: AiToolParameter[]): z.ZodObject<...>` and `discoverToolNodes(agentNodeId: string, allNodes: Node[], allConnections: Connection[]): ValidatedToolNode[]` (where `ValidatedToolNode = { node: Node; aiTool: AiToolConfig }`) — both consumed by Task 8's Agent executor.

- [ ] **Step 1: Write the failing tests for `buildToolInputSchema`**

Create `src/features/workflows/nodes/executions/components/agent/tool-schema.test.ts`:

```ts
import { describe, expect, test } from "bun:test";
import { buildToolInputSchema } from "./tool-schema";

describe("buildToolInputSchema", () => {
  test("builds a zod object with one field per parameter", () => {
    const schema = buildToolInputSchema([
      { name: "city", type: "string", description: "The city to look up" },
      { name: "days", type: "number", description: "How many days ahead" },
    ]);

    const result = schema.safeParse({ city: "Austin", days: 3 });
    expect(result.success).toBe(true);
  });

  test("maps each declared type to the matching zod primitive", () => {
    const schema = buildToolInputSchema([
      { name: "a", type: "string", description: "d" },
      { name: "b", type: "number", description: "d" },
      { name: "c", type: "boolean", description: "d" },
    ]);

    expect(schema.safeParse({ a: "x", b: 1, c: true }).success).toBe(true);
    expect(schema.safeParse({ a: 1, b: 1, c: true }).success).toBe(false);
    expect(schema.safeParse({ a: "x", b: "not a number", c: true }).success).toBe(false);
    expect(schema.safeParse({ a: "x", b: 1, c: "not a boolean" }).success).toBe(false);
  });

  test("every parameter is required — missing fields fail validation", () => {
    const schema = buildToolInputSchema([
      { name: "city", type: "string", description: "The city to look up" },
    ]);

    expect(schema.safeParse({}).success).toBe(false);
  });

  test("an empty parameter list produces a schema accepting an empty object", () => {
    const schema = buildToolInputSchema([]);
    expect(schema.safeParse({}).success).toBe(true);
  });
});
```

- [ ] **Step 2: Run to verify it fails**

Run: `bun test src/features/workflows/nodes/executions/components/agent/tool-schema.test.ts`
Expected: FAIL — `Cannot find module './tool-schema'`.

- [ ] **Step 3: Implement `tool-schema.ts`**

```ts
import { z } from "zod";
import type { AiToolParameter } from "../../lib/ai-tool";

function zodTypeFor(type: AiToolParameter["type"]): z.ZodTypeAny {
  switch (type) {
    case "number":
      return z.number();
    case "boolean":
      return z.boolean();
    default:
      return z.string();
  }
}

/**
 * Builds the zod input schema the AI SDK uses to validate/generate a tool
 * call's arguments, from a tool node's configured AI-tool parameter list.
 * Every parameter is required — no optional/default-valued parameters in
 * this first version (see the plan's Global Constraints).
 */
export function buildToolInputSchema(parameters: AiToolParameter[]) {
  const shape: Record<string, z.ZodTypeAny> = {};
  for (const parameter of parameters) {
    shape[parameter.name] = zodTypeFor(parameter.type).describe(parameter.description);
  }
  return z.object(shape);
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `bun test src/features/workflows/nodes/executions/components/agent/tool-schema.test.ts`
Expected: PASS, 4 tests.

- [ ] **Step 5: Write the failing tests for `discoverToolNodes`**

Create `src/features/workflows/nodes/executions/components/agent/discover-tools.test.ts`:

```ts
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
```

- [ ] **Step 6: Run to verify it fails**

Run: `bun test src/features/workflows/nodes/executions/components/agent/discover-tools.test.ts`
Expected: FAIL — `Cannot find module './discover-tools'`.

- [ ] **Step 7: Implement `discover-tools.ts`**

```ts
import { NonRetriableError } from "inngest";
import type { Connection, Node } from "@/generated/prisma/client";
import type { AiToolConfig } from "../../lib/ai-tool";
import { toolTargetHandleId } from "../../lib/tool-connections";

export interface ValidatedToolNode {
  node: Node;
  aiTool: AiToolConfig;
}

/**
 * Finds every node connected into `agentNodeId`'s tool-target handle,
 * validates each has a complete "Use as AI Tool" configuration and a
 * variable name, and returns them ready for the Agent executor to build
 * `tool()` entries from. Throws NonRetriableError (fails the whole node,
 * matching every other executor's config-validation convention) for a
 * misconfigured or missing connected node — this happens before any model
 * call, so it's a configuration error, not a runtime tool-call error.
 */
export function discoverToolNodes(
  agentNodeId: string,
  allNodes: Node[],
  allConnections: Connection[],
): ValidatedToolNode[] {
  const targetHandle = toolTargetHandleId(agentNodeId);
  const toolNodeIds = allConnections
    .filter((connection) => connection.toInput === targetHandle)
    .map((connection) => connection.fromNodeId);

  const nodesById = new Map(allNodes.map((node) => [node.id, node]));

  return toolNodeIds.map((id) => {
    const node = nodesById.get(id);
    if (!node) {
      throw new NonRetriableError(`Agent node: connected tool node "${id}" not found`);
    }

    const data = node.data as { aiTool?: Partial<AiToolConfig>; variableName?: string };

    if (!data.aiTool?.description || !data.aiTool.parameters) {
      throw new NonRetriableError(
        `Agent node: "${node.name}" is connected as a tool but has no "Use as AI Tool" configuration`,
      );
    }
    if (!data.variableName) {
      throw new NonRetriableError(
        `Agent node: "${node.name}" is connected as a tool but has no variable name configured`,
      );
    }

    return {
      node,
      aiTool: { description: data.aiTool.description, parameters: data.aiTool.parameters },
    };
  });
}
```

- [ ] **Step 8: Run tests to verify they pass**

Run: `bun test src/features/workflows/nodes/executions/components/agent/discover-tools.test.ts`
Expected: PASS, 6 tests.

Run: `bunx tsc --noEmit` — same 8 pre-existing baseline errors, 0 new.

- [ ] **Step 9: Commit**

```bash
git add src/features/workflows/nodes/executions/components/agent/tool-schema.ts src/features/workflows/nodes/executions/components/agent/tool-schema.test.ts src/features/workflows/nodes/executions/components/agent/discover-tools.ts src/features/workflows/nodes/executions/components/agent/discover-tools.test.ts
git commit -m "feat: Agent tool-schema builder and tool discovery"
```

---

### Task 7: Agent node's data type, canvas component, and dialog

**Files:**
- Create: `src/features/workflows/nodes/executions/components/agent/types.ts`
- Create: `src/features/workflows/nodes/executions/components/agent/node.tsx`
- Create: `src/features/workflows/nodes/executions/components/agent/dialog.tsx`

**Interfaces:**
- Consumes: `AIProviderType`/`AI_PROVIDERS` from `@/features/credentials/lib/ai-providers`, `useApiKeysByType` from `@/features/credentials/hooks/use-credentials`, `toolTargetHandleId` from `../../lib/tool-connections` (Task 2), `NodeStatus` from `../../../react-flow/status-indicator`, `NodeIcon` from `../../../node-icon`.
- Produces: `AgentNodeData` type and `AgentNode` canvas component — consumed by Task 9's registration.

- [ ] **Step 1: `types.ts`**

```ts
import type { AIProviderType } from "@/features/credentials/lib/ai-providers";

export interface AgentNodeData {
  variableName?: string;
  provider?: AIProviderType;
  credentialId?: string;
  systemPrompt?: string;
  userPrompt?: string;
  /** LLM round-trips before the loop stops. Default 5, hard ceiling 15 — see the plan's Global Constraints. */
  maxSteps?: number;
}
```

- [ ] **Step 2: `dialog.tsx`**

```tsx
"use client";

import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  Form,
  FormControl,
  FormDescription,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from "@/components/ui/form";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Button } from "@/components/ui/button";
import { zodResolver } from "@hookform/resolvers/zod";
import { useForm } from "react-hook-form";
import { useEffect, useRef } from "react";
import z from "zod";
import Link from "next/link";
import { AI_PROVIDERS } from "@/features/credentials/lib/ai-providers";
import { useApiKeysByType } from "@/features/credentials/hooks/use-credentials";
import type { AgentNodeData } from "./types";

const formSchema = z.object({
  variableName: z
    .string()
    .min(1, "Variable name is required")
    .regex(
      /^[A-Za-z_$][A-Za-z0-9_$]*$/,
      "Variable name must start with a letter or underscore and contain only letters, numbers, and underscores",
    ),
  provider: z.enum(["OPENAI", "ANTHROPIC", "GEMINI", "GROQ"]),
  credentialId: z.string().min(1, "Credential is required"),
  systemPrompt: z.string().optional(),
  userPrompt: z.string().min(1, "User prompt is required"),
  maxSteps: z.number().int().min(1, "Must be at least 1").max(15, "Must be 15 or fewer"),
});

export type AgentFormValues = z.infer<typeof formSchema>;

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSubmit: (values: AgentFormValues) => void;
  defaultValues?: Partial<AgentNodeData>;
}

function toFormDefaults(data: Partial<AgentNodeData> = {}): AgentFormValues {
  return {
    variableName: data.variableName || "",
    provider: data.provider || "OPENAI",
    credentialId: data.credentialId || "",
    systemPrompt: data.systemPrompt || "",
    userPrompt: data.userPrompt || "",
    maxSteps: data.maxSteps ?? 5,
  };
}

export const AgentNodeDialog = ({ open, onOpenChange, onSubmit, defaultValues = {} }: Props) => {
  const form = useForm<AgentFormValues>({
    resolver: zodResolver(formSchema),
    defaultValues: toFormDefaults(defaultValues),
  });

  // Reset the whole form to the node's saved values every time the dialog
  // opens — but NOT on every keystroke while it's open. Guards against
  // clobbering an in-progress edit if `defaultValues`' object identity
  // happens to change while open (it doesn't today, but matches the same
  // open-gated pattern every other node dialog in this codebase already
  // uses, e.g. ai-dialog.tsx).
  useEffect(() => {
    if (open) {
      form.reset(toFormDefaults(defaultValues));
    }
  }, [open, defaultValues, form]);

  const watchProvider = form.watch("provider");
  const watchVariableName = form.watch("variableName") || "myAgent";

  // Switching providers invalidates whatever credential was selected (it
  // belongs to the old provider's type) — clear it. Skipped on the render
  // right after the dialog opens/resets, so loading an already-configured
  // Agent node doesn't immediately wipe its saved credentialId.
  const skipNextProviderReset = useRef(true);
  useEffect(() => {
    if (open) {
      skipNextProviderReset.current = true;
      return;
    }
  }, [open]);
  useEffect(() => {
    if (skipNextProviderReset.current) {
      skipNextProviderReset.current = false;
      return;
    }
    form.setValue("credentialId", "");
  }, [watchProvider, form]);

  const { data: credentials, isLoading: isLoadingCredentials } = useApiKeysByType(watchProvider);
  const hasCredentials = Boolean(credentials?.length);
  const providerLabel = AI_PROVIDERS.find((p) => p.type === watchProvider)?.label ?? watchProvider;

  const handleSubmit = (values: AgentFormValues) => {
    onSubmit(values);
    onOpenChange(false);
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>AI Agent</DialogTitle>
          <DialogDescription>
            Configure the model, prompt, and tool-call limit for this agent.
          </DialogDescription>
        </DialogHeader>
        <Form {...form}>
          <form onSubmit={form.handleSubmit(handleSubmit)} className="space-y-8 mt-4">
            <FormField
              control={form.control}
              name="variableName"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Variable Name</FormLabel>
                  <FormControl>
                    <Input {...field} placeholder="myAgent" />
                  </FormControl>
                  <FormDescription>
                    Use this name to reference the result in other nodes:{" "}
                    {`{{${watchVariableName}.text}}`}
                  </FormDescription>
                  <FormMessage />
                </FormItem>
              )}
            />
            <FormField
              control={form.control}
              name="provider"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Model Provider</FormLabel>
                  <Select onValueChange={field.onChange} defaultValue={field.value}>
                    <FormControl>
                      <SelectTrigger className="w-full">
                        <SelectValue placeholder="Select a provider" />
                      </SelectTrigger>
                    </FormControl>
                    <SelectContent>
                      {AI_PROVIDERS.map((provider) => (
                        <SelectItem key={provider.type} value={provider.type}>
                          {provider.label}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                  <FormMessage />
                </FormItem>
              )}
            />
            <FormField
              control={form.control}
              name="credentialId"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>{providerLabel} Credential</FormLabel>
                  <Select
                    onValueChange={field.onChange}
                    value={field.value}
                    disabled={isLoadingCredentials || !hasCredentials}
                  >
                    <FormControl>
                      <SelectTrigger className="w-full">
                        <SelectValue
                          placeholder={
                            isLoadingCredentials
                              ? "Loading credentials..."
                              : hasCredentials
                                ? "Select a credential"
                                : "No credentials saved yet"
                          }
                        />
                      </SelectTrigger>
                    </FormControl>
                    <SelectContent>
                      {credentials?.map((credential) => (
                        <SelectItem key={credential.id} value={credential.id}>
                          {credential.name}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                  {!isLoadingCredentials && !hasCredentials && (
                    <FormDescription>
                      <Link href="/credentials" className="underline">
                        Add a {providerLabel} API key
                      </Link>{" "}
                      first.
                    </FormDescription>
                  )}
                  <FormMessage />
                </FormItem>
              )}
            />
            <FormField
              control={form.control}
              name="systemPrompt"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>System Prompt (Optional)</FormLabel>
                  <FormControl>
                    <Textarea
                      {...field}
                      placeholder="You are a helpful assistant with access to tools."
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
            <FormField
              control={form.control}
              name="userPrompt"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>User Prompt</FormLabel>
                  <FormControl>
                    <Textarea
                      {...field}
                      placeholder="What's the weather in {{myApiCall.httpResponse.data.city}}?"
                      className="min-h-[120px] font-mono text-sm"
                    />
                  </FormControl>
                  <FormDescription>
                    The prompt sent to the model. Use {"{{variables}}"} to reference earlier
                    nodes' output.
                  </FormDescription>
                  <FormMessage />
                </FormItem>
              )}
            />
            <FormField
              control={form.control}
              name="maxSteps"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Max Steps</FormLabel>
                  <FormControl>
                    <Input
                      type="number"
                      min={1}
                      max={15}
                      {...field}
                      onChange={(event) => field.onChange(Number(event.target.value))}
                    />
                  </FormControl>
                  <FormDescription>
                    How many model round-trips this agent can take (including tool calls) before
                    it must return a final answer. 1-15.
                  </FormDescription>
                  <FormMessage />
                </FormItem>
              )}
            />
            <DialogFooter className="mt-4">
              <Button className="w-full" type="submit">
                Save
              </Button>
            </DialogFooter>
          </form>
        </Form>
      </DialogContent>
    </Dialog>
  );
};
```

- [ ] **Step 3: `node.tsx`**

```tsx
"use client";

import { type Node, type NodeProps, Position, useReactFlow } from "@xyflow/react";
import { BotIcon } from "lucide-react";
import { memo, useState } from "react";
import { BaseHandle } from "../../../react-flow/base-handle";
import { BaseNode, BaseNodeContent } from "../../../react-flow/base-node";
import { NodeStatus, NodeStatusIndicator } from "../../../react-flow/status-indicator";
import { NodeIcon } from "../../../node-icon";
import { WorkflowNode } from "../../../workflow-node";
import { toolTargetHandleId } from "../../lib/tool-connections";
import { AgentFormValues, AgentNodeDialog } from "./dialog";
import type { AgentNodeData } from "./types";

type AgentNodeType = Node<AgentNodeData>;

/**
 * Not built on BaseExecutionNode — it needs a second *target* handle (for
 * incoming tool connections), a different shape than BaseExecutionNode's
 * `toolCapable` second *source* handle. Composed from the same low-level
 * primitives BaseExecutionNode itself uses, the way BaseBranchNode does for
 * its own different-shaped handle set.
 */
export const AgentNode = memo((props: NodeProps<AgentNodeType>) => {
  const { id, data } = props;
  const { setNodes, setEdges } = useReactFlow();

  const [dialogOpen, setDialogOpen] = useState(false);
  const handleOpenSettings = () => setDialogOpen(true);

  const handleDelete = () => {
    setNodes((currentNodes) => currentNodes.filter((node) => node.id !== id));
    setEdges((currentEdges) =>
      currentEdges.filter((edge) => edge.source !== id && edge.target !== id),
    );
  };

  const handleSubmit = (values: AgentFormValues) => {
    setNodes((nodes) =>
      nodes.map((node) => (node.id === id ? { ...node, data: { ...node.data, ...values } } : node)),
    );
  };

  const nodeStatus = ((data as Record<string, unknown>)?.status as NodeStatus) ?? "initial";
  const description = data?.userPrompt
    ? `{{${data.variableName || "myAgent"}.text}}`
    : "Not Configured";

  return (
    <>
      <AgentNodeDialog
        open={dialogOpen}
        onOpenChange={setDialogOpen}
        onSubmit={handleSubmit}
        defaultValues={data}
      />
      <WorkflowNode
        name="AI Agent"
        description={description}
        onDelete={handleDelete}
        onSettings={handleOpenSettings}
      >
        <NodeStatusIndicator status={nodeStatus} variant="border">
          <BaseNode status={nodeStatus} onDoubleClick={handleOpenSettings}>
            <BaseNodeContent>
              <NodeIcon icon={BotIcon} label="AI Agent" className="size-4 text-muted-foreground" />
              <BaseHandle id={`${id}-target`} type="target" position={Position.Left} />
              <BaseHandle id={`${id}-source`} type="source" position={Position.Right} />
              <BaseHandle
                id={toolTargetHandleId(id)}
                type="target"
                position={Position.Bottom}
                title="Connect tools here"
              />
            </BaseNodeContent>
          </BaseNode>
        </NodeStatusIndicator>
      </WorkflowNode>
    </>
  );
});

AgentNode.displayName = "AgentNode";
```

- [ ] **Step 4: Typecheck**

Run: `bunx tsc --noEmit` — same 8 pre-existing baseline errors, 0 new.

- [ ] **Step 5: Commit**

```bash
git add src/features/workflows/nodes/executions/components/agent/types.ts src/features/workflows/nodes/executions/components/agent/node.tsx src/features/workflows/nodes/executions/components/agent/dialog.tsx
git commit -m "feat: Agent node canvas component and config dialog"
```

---

### Task 8: Agent executor

**Files:**
- Create: `src/features/workflows/nodes/executions/components/agent/executor.ts`

**Interfaces:**
- Consumes: `discoverToolNodes` and `buildToolInputSchema` (Task 6), `AgentNodeData` (Task 7), `getExecutor`/`allNodes`/`allConnections` on `NodeExecutorParams` (Task 3), `decrypt` from `@/lib/encryption`, `prisma` from `@/lib/db` (both already used by `create-ai-executor.ts`).
- Produces: `AgentExecutor: NodeExecutor<AgentNodeData>` — consumed by Task 9's registration.

No dedicated test file for this task — see the plan's Global Constraints (matches `create-ai-executor.ts`'s existing zero-coverage convention for the model-calling orchestration; all the pure logic it depends on was already tested in Task 6).

- [ ] **Step 1: Implement**

```ts
import { NonRetriableError } from "inngest";
import { createAnthropic } from "@ai-sdk/anthropic";
import { createGroq } from "@ai-sdk/groq";
import { createOpenAI } from "@ai-sdk/openai";
import { createGoogleGenerativeAI } from "@ai-sdk/google";
import { generateText, stepCountIs, tool, type LanguageModel } from "ai";
import { prisma } from "@/lib/db";
import { decrypt } from "@/lib/encryption";
import type { AIProviderType } from "@/features/credentials/lib/ai-providers";
import type { NodeExecutor, StepTools } from "../../types";
import { resolveTemplate } from "../../lib/resolve-template";
import { buildToolInputSchema } from "./tool-schema";
import { discoverToolNodes } from "./discover-tools";
import type { AgentNodeData } from "./types";

function createModel(provider: AIProviderType, apiKey: string): LanguageModel {
  switch (provider) {
    case "ANTHROPIC":
      return createAnthropic({ apiKey })("claude-sonnet-5");
    case "GEMINI":
      return createGoogleGenerativeAI({ apiKey })("gemini-2.0-flash");
    case "GROQ":
      return createGroq({ apiKey })("llama-3.3-70b-versatile");
    default:
      return createOpenAI({ apiKey })("gpt-4o-mini");
  }
}

// A tool node's own executor calls step.run(...) internally (e.g.
// HttpRequestExecutor). Calling that from inside another step.run's
// callback is illegal (Inngest doesn't support nested steps) — and since
// the model's choice of which tools to call isn't deterministic, treating
// each tool call as its OWN independently-memoized Inngest step risks a
// retry replaying a stale result against a differently-parameterized call.
// This passthrough sidesteps both problems: it satisfies StepTools'
// shape enough for a tool node's own `step.run(name, fn)` calls to work,
// but never registers anything with Inngest — the underlying work (e.g.
// the HTTP request) runs for real, every time, non-memoized. Cost: an
// individual tool call isn't independently retried by Inngest on transient
// failure — ky (used by HttpRequestExecutor) retries transient failures by
// default, and a persistently failing call becomes an error result the
// model can react to (see the try/catch below), not a fatal abort.
const passthroughStep = {
  run: async <T>(_name: string, fn: () => Promise<T>) => fn(),
} as unknown as StepTools;

export const AgentExecutor: NodeExecutor<AgentNodeData> = async ({
  data,
  nodeId,
  userId,
  context,
  step,
  getExecutor,
  allNodes,
  allConnections,
}) => {
  if (!data.variableName) {
    throw new NonRetriableError("Agent node: Variable name is required");
  }
  if (!data.provider) {
    throw new NonRetriableError("Agent node: Model provider is required");
  }
  if (!data.credentialId) {
    throw new NonRetriableError("Agent node: Credential is required");
  }
  if (!data.userPrompt) {
    throw new NonRetriableError("Agent node: User prompt is required");
  }

  const variableName = data.variableName;
  const provider = data.provider;
  const credentialId = data.credentialId;
  const maxSteps = Math.min(Math.max(data.maxSteps ?? 5, 1), 15);
  const systemPrompt = data.systemPrompt
    ? String(resolveTemplate(data.systemPrompt, context) ?? "")
    : undefined;
  const userPrompt = String(resolveTemplate(data.userPrompt, context) ?? "");

  const toolNodes = discoverToolNodes(nodeId, allNodes, allConnections);

  const credential = await step.run(`agent-get-credential-${nodeId}`, () =>
    prisma.credential.findFirst({
      where: { id: credentialId, userId, type: provider },
      select: { value: true },
    }),
  );

  if (!credential) {
    throw new NonRetriableError("Agent node: Credential not found");
  }

  const text = await step.run(`agent-run-${nodeId}`, async () => {
    let apiKey: string;
    try {
      apiKey = decrypt(credential.value);
    } catch {
      throw new NonRetriableError("Agent node: Credential could not be decrypted");
    }

    const model = createModel(provider, apiKey);

    const tools = Object.fromEntries(
      toolNodes.map(({ node: toolNode, aiTool }) => [
        toolNode.id,
        tool({
          description: aiTool.description,
          inputSchema: buildToolInputSchema(aiTool.parameters),
          execute: async (input) => {
            const toolExecutor = getExecutor(toolNode.type);
            const toolContext = { ...context, $fromAI: input as Record<string, unknown> };
            try {
              const result = await toolExecutor({
                data: toolNode.data as Record<string, unknown>,
                nodeId: toolNode.id,
                context: toolContext,
                step: passthroughStep,
                userId,
                getExecutor,
                allNodes,
                allConnections,
              });
              const toolVariableName = (toolNode.data as { variableName?: string }).variableName;
              return toolVariableName
                ? (result.context[toolVariableName] ?? result.context)
                : result.context;
            } catch (error) {
              // A tool failure is domain information for the model, not a
              // workflow-execution failure — it can retry with different
              // arguments, try something else, or explain the failure in
              // its final answer. Deliberately differs from every other
              // node's fail-the-whole-run convention (see the plan's
              // Global Constraints).
              return { error: error instanceof Error ? error.message : String(error) };
            }
          },
        }),
      ]),
    );

    const result = await generateText({
      model,
      system: systemPrompt,
      prompt: userPrompt,
      tools,
      stopWhen: stepCountIs(maxSteps),
    });
    return result.text;
  });

  return {
    context: {
      ...context,
      [variableName]: { text },
    },
  };
};
```

- [ ] **Step 2: Typecheck**

Run: `bunx tsc --noEmit` — same 8 pre-existing baseline errors, 0 new. The four `create*` calls and model strings above (`claude-sonnet-5`, `gemini-2.0-flash`, `llama-3.3-70b-versatile`, `gpt-4o-mini`) were copied verbatim from this codebase's existing `anthropic/executor.ts`, `gemini/executor.ts`, `groq/executor.ts`, and `openai/executor.ts` — same models the 4 single-shot AI nodes already use, so Agent behavior is consistent with them.

- [ ] **Step 3: Commit**

```bash
git add src/features/workflows/nodes/executions/components/agent/executor.ts
git commit -m "feat: Agent executor — multi-step tool-calling loop"
```

---

### Task 9: Registration — executor registry, node components, node selector

**Files:**
- Modify: `src/features/workflows/nodes/executions/lib/executor-registry.ts`
- Modify: `src/features/workflows/nodes/node-components.ts`
- Modify: `src/features/workflows/nodes/node-selector.tsx`

**Interfaces:**
- Consumes: `AgentExecutor` (Task 8), `AgentNode` (Task 7), `NodeType.AGENT` (Task 1).

This is the last piece connecting everything — after this task, the Agent node is selectable, renders, and executes.

- [ ] **Step 1: Register the executor**

In `src/features/workflows/nodes/executions/lib/executor-registry.ts`, add the import and registry entry:

```ts
import { NodeType } from "@/generated/prisma/enums";
import { NodeExecutor } from "../types";
import { manualTriggerExecutor } from "../../triggers/components/manual-trigger/executor";
import { HttpRequestExecutor } from "../components/http-request/executor";
import { IfExecutor } from "../components/if/executor";
import { SwitchExecutor } from "../components/switch/executor";
import { OpenAiExecutor } from "../components/openai/executor";
import { AnthropicExecutor } from "../components/anthropic/executor";
import { GeminiExecutor } from "../components/gemini/executor";
import { GroqExecutor } from "../components/groq/executor";
import { AgentExecutor } from "../components/agent/executor";

export const executorRegistry: Record<NodeType, NodeExecutor> = {
  [NodeType.MANUAL_TRIGGER]: manualTriggerExecutor,
  [NodeType.INITIAL]: manualTriggerExecutor,
  [NodeType.HTTP_REQUEST]: HttpRequestExecutor,
  [NodeType.IF]: IfExecutor,
  [NodeType.SWITCH]: SwitchExecutor,
  [NodeType.OPENAI]: OpenAiExecutor,
  [NodeType.ANTHROPIC]: AnthropicExecutor,
  [NodeType.GEMINI]: GeminiExecutor,
  [NodeType.GROQ]: GroqExecutor,
  [NodeType.AGENT]: AgentExecutor,
};

export const getExecutor = (type: NodeType): NodeExecutor => {
  const executor = executorRegistry[type];
  if (!executor) {
    throw new Error(`No executor found for node type: ${type}`);
  }
  return executor;
};
```

- [ ] **Step 2: Register the canvas component**

In `src/features/workflows/nodes/node-components.ts`, add the import and entry:

```ts
import { InitialNode } from "./initial-node";
import { NodeType } from "@/generated/prisma/enums";
import type { NodeTypes } from "@xyflow/react";
import { HttpRequestNode } from "./executions/components/http-request/http-request-node";
import { ManualTriggerNode } from "./triggers/components/manual-trigger/manual-trigger";
import { IfNode } from "./executions/components/if/if-node";
import { SwitchNode } from "./executions/components/switch/switch-node";
import { OpenAiNode } from "./executions/components/openai/node";
import { AnthropicNode } from "./executions/components/anthropic/node";
import { GeminiNode } from "./executions/components/gemini/node";
import { GroqNode } from "./executions/components/groq/node";
import { AgentNode } from "./executions/components/agent/node";

export const nodeComponents: Record<NodeType, NodeTypes[string]> = {
  [NodeType.INITIAL]: InitialNode,
  [NodeType.HTTP_REQUEST]: HttpRequestNode,
  [NodeType.MANUAL_TRIGGER]: ManualTriggerNode,
  [NodeType.IF]: IfNode,
  [NodeType.SWITCH]: SwitchNode,
  [NodeType.OPENAI]: OpenAiNode,
  [NodeType.ANTHROPIC]: AnthropicNode,
  [NodeType.GEMINI]: GeminiNode,
  [NodeType.GROQ]: GroqNode,
  [NodeType.AGENT]: AgentNode,
} satisfies NodeTypes;

export type RegisteredNodeType = keyof typeof nodeComponents;
```

- [ ] **Step 3: Add the node-selector entry**

In `src/features/workflows/nodes/node-selector.tsx`, add `BotIcon` to the lucide import and one entry to `executionNodes`:

```ts
import {
    BotIcon,
    GitBranchIcon,
    GlobeIcon,
    MousePointerIcon,
    SplitIcon
} from "lucide-react"
```

```ts
const executionNodes: NodeTypeOption[] = [
    {
        type: NodeType.HTTP_REQUEST,
        label: "HTTP Request",
        description: "Makes an HTTP request",
        icon: GlobeIcon
    },
    {
        type: NodeType.IF,
        label: "IF",
        description: "Branch the workflow based on a condition",
        icon: GitBranchIcon
    },
    {
        type: NodeType.SWITCH,
        label: "Switch",
        description: "Route the workflow to a matching case",
        icon: SplitIcon
    },
    {
        type: NodeType.AGENT,
        label: "AI Agent",
        description: "Run a multi-step AI agent that can call tools",
        icon: BotIcon
    },
    {
        type: NodeType.OPENAI,
        label: "OpenAI",
        description: "Generate text with an OpenAI model",
        icon: "/openai.svg"
    },
    {
        type: NodeType.ANTHROPIC,
        label: "Anthropic",
        description: "Generate text with an Anthropic model",
        icon: "/anthropic.svg"
    },
    {
        type: NodeType.GEMINI,
        label: "Gemini",
        description: "Generate text with a Gemini model",
        icon: "/gemini.svg"
    },
    {
        type: NodeType.GROQ,
        label: "Groq",
        description: "Generate text with a Groq-hosted model",
        icon: "/groq.svg"
    },
];
```

- [ ] **Step 4: Typecheck and run the full suite**

Run: `bunx tsc --noEmit` — same 8 pre-existing baseline errors, 0 new. (`Record<NodeType, ...>` on both registries means a missing `AGENT` entry in either file would be a compile error — this step is the type-level proof both registrations are complete.)

Run: `bun test` — all tests still passing (expect 44 pre-existing + 6 from Task 2 + 1 from Task 3 + 2 from Task 4 + 4 + 6 from Task 6 = 63 total; verify the actual count printed, don't assume).

- [ ] **Step 5: Commit**

```bash
git add src/features/workflows/nodes/executions/lib/executor-registry.ts src/features/workflows/nodes/node-components.ts src/features/workflows/nodes/node-selector.tsx
git commit -m "feat: register the Agent node (executor, canvas component, node selector)"
```

---

### Task 10: End-to-end verification

**Files:** none (verification only)

- [ ] **Step 1: Full automated verification**

Run: `bun test && bunx tsc --noEmit`
Expected: all tests passing, typecheck clean except the 8 pre-existing unrelated errors.

- [ ] **Step 2: Manual smoke test**

No browser is available in this sandbox (same limitation noted in the Live Execution Status plan) — for whoever runs this plan in an environment with one, or for the user to do afterward:

1. `bun run dev:all`
2. Add an HTTP Request node pointed at a real reachable URL (e.g. `https://api.open-meteo.com/v1/forecast?latitude={{ $fromAI.lat }}&longitude={{ $fromAI.lon }}&current_weather=true`). Open its dialog, check "Use as AI Tool", give it a description ("Looks up current weather for a latitude/longitude"), and add two parameters: `lat` (number, "Latitude"), `lon` (number, "Longitude").
3. Add an AI Agent node. Configure a provider you have a saved credential for, a user prompt like "What's the weather at latitude 30.27, longitude -97.74?", and connect the HTTP Request node's bottom handle into the Agent node's bottom handle.
4. Click Execute Workflow. Confirm: the Agent node shows loading then success, the HTTP Request node connected as a tool does NOT show a separate loading/success cycle on the canvas (out of scope for this plan, per the design spec), and the Agent's final answer (visible via a downstream node referencing `{{myAgent.text}}`, or by checking the Inngest dev server's function-run log) reflects the tool's actual result.
5. Disconnect the tool connection and re-run — confirm the Agent still succeeds with a plain text answer and no tool calls.

- [ ] **Step 3: Commit** (only if Step 2 uncovered a fix)

If manual verification found nothing to fix, there's nothing to commit for this task.

---

## Explicitly out of scope for this plan

- Live per-tool-call status on the canvas — the Agent node itself still shows loading→success/error via `runWorkflow`'s existing central publish.
- Structured/typed Agent output — plain text only, matching the 4 AI nodes today.
- Tool-capable node types beyond HTTP Request — the mechanism is generic; wiring up more types is a small addition per type.
- Conversation memory across runs.
- Optional/default-valued tool parameters.
- Any change to the Webhook trigger node, additional n8n-parity nodes, execution history page, billing page, or settings page — separate, later plans per the user's own stated sequencing.
