# Branching (IF node) — Design Spec

Date: 2026-08-16
Status: Approved for planning
Scope: Sub-project 1 of 3 (branching → credential system → integration nodes).
This spec covers branching only.

## Context

Relay is a workflow builder (Next.js, React Flow, tRPC, Prisma, Inngest)
modeled after n8n. Today the execution engine (`src/inngest/function.ts`)
runs every node in a workflow, in topologically-sorted order, unconditionally.
There is no way to skip nodes based on data — every node in the graph always
executes, including side-effecting ones (e.g. `HTTP_REQUEST`).

This spec adds a single-condition `IF` node with two outputs (`true`/`false`),
and changes the execution engine so that only nodes reachable via the taken
branch actually execute. Nodes on the untaken branch are skipped entirely —
their executors are never invoked, so side effects (e.g. an HTTP call) never
fire.

`Switch` (multi-output, n8n's other branching primitive) is explicitly out of
scope for this pass, but the design (typed `branch` field on executor
results, per-output handle IDs) is chosen so Switch is a natural extension
later, not a rework.

## Prerequisite gap being fixed in passing

`{{variable.path}}` templating is referenced in the HTTP node dialog's copy
("Use this name to reference the result in other nodes: ...") but no
resolution logic exists anywhere in the codebase — `HttpRequestExecutor`
passes `data.endpoint`/`data.body` straight through unmodified. The IF node
needs real template resolution to read values out of the shared execution
`context`, so this spec adds a small shared resolver and wires the HTTP node
to use it too (same file, directly adjacent code, in scope).

## Data model changes

`prisma/schema.prisma`:
- Add `IF` to `enum NodeType`.
- No `Connection` schema change. `fromOutput` (`String @default("main")`)
  already exists; branching just starts writing non-`"main"` values into it.

Requires a new migration (`bun run migrate:dev`).

## New shared utility: template resolver

New file: `src/features/workflows/nodes/executions/lib/resolve-template.ts`

```ts
export function resolveTemplate(template: string, context: WorkflowContext): unknown
```

- Parses `{{path.to.value}}` — dot-path only, no expressions, no filters.
- If the entire string is exactly one `{{...}}` reference, returns the
  resolved value with its native type (so a template resolving to a number
  stays a number — required for the IF node's numeric operators).
- If the string contains other characters around/between one or more
  `{{...}}` references, does string substitution (stringifying each
  resolved value into place) — this is the mode `HttpRequestExecutor`'s
  `endpoint`/`body` fields use.
- A reference to a missing path resolves to `undefined`; callers decide how
  to treat that (the IF executor treats it as a resolution failure, see
  below; the HTTP executor substitutes the string `"undefined"` — matches
  today's implicit behavior of unresolved templates just passing through
  literally, now at least made explicit and centralized).

`HttpRequestExecutor` is updated to call `resolveTemplate` on `endpoint` and
`body` before use. This is a behavior change (those fields actually resolve
now) but strictly additive — nothing today relies on templates being inert.

## IF node

### Data shape

```ts
type IfNodeData = {
  value?: string;        // supports {{template}}
  operator?: "equals" | "notEquals" | "contains" | "notContains"
            | "startsWith" | "endsWith" | "greaterThan" | "lessThan"
            | "isEmpty" | "isNotEmpty";
  compareValue?: string; // supports {{template}}; unused for isEmpty/isNotEmpty
};
```

`greaterThan`/`lessThan` coerce both operands with `Number(...)`; if either
side is `NaN` after coercion, the executor throws (see Error Handling).
All other operators treat both operands as strings.

### Dialog

New file: `src/features/workflows/nodes/executions/components/if/dialog.tsx`.
Same structure as `HttpRequestNodeDialog` (zod schema + `react-hook-form` +
existing `Form`/`Input`/`Select` UI primitives). `compareValue` field is
hidden when `operator` is `isEmpty`/`isNotEmpty`, mirroring how the HTTP
dialog already hides its `body` field for non-body methods.

### Canvas component

`BaseExecutionNode` and `BaseTriggerNode` each render exactly one source
handle — insufficient for a two-output node. Add a new base:

New file: `src/features/workflows/nodes/executions/components/base-branch-node.tsx`
(`BaseBranchNode`) — same toolbar/delete/settings/status-indicator behavior
as `BaseExecutionNode`, but accepts:

```ts
outputs: { id: string; label: string }[]
```

and renders one `BaseHandle` per entry, stacked vertically on the node's
right edge (first entry on top). Handle `id` follows the existing
`${nodeId}-{suffix}-source` convention used elsewhere (e.g.
`${id}-target`/`${id}-source` in `BaseExecutionNode`), so:
`${nodeId}-true-source`, `${nodeId}-false-source`.

New file: `src/features/workflows/nodes/executions/components/if/if-node.tsx`
(`IfNode`) — uses `BaseBranchNode` with
`outputs: [{ id: "true", label: "True" }, { id: "false", label: "False" }]`,
icon `GitBranchIcon` (lucide-react), same dialog-open-on-double-click pattern
as `HttpRequestNode`.

### Registration (standard 4-touchpoint checklist)

1. `NodeType.IF` added to `enum NodeType` (schema.prisma) — done above.
2. `nodeComponents` (`node-components.ts`): `[NodeType.IF]: IfNode`.
3. `executorRegistry` (`executor-registry.ts`): `[NodeType.IF]: IfExecutor`.
4. `node-selector.tsx`'s `executionNodes` array: label "IF", description
   "Branch the workflow based on a condition", icon `GitBranchIcon`.

## Executor

New file: `src/features/workflows/nodes/executions/components/if/executor.ts`
(`IfExecutor`, same shape/style as `HttpRequestExecutor`):

1. Resolve `value` via `resolveTemplate`. If `value` is missing/empty or
   resolves to `undefined`, throw `NonRetriableError` ("IF node: value could
   not be resolved").
2. If operator requires `compareValue` (all except `isEmpty`/`isNotEmpty`)
   and it's missing, resolve it too (same treatment).
3. Evaluate the comparison inside `step.run(\`if-${nodeId}\`, ...)`,
   consistent with the other two executors keeping side-effect-adjacent work
   inside a durable step.
4. Return `{ context, branch: result ? "true" : "false" }`.

## `NodeExecutor` type change (breaking, mechanical)

`executions/types.ts`:

```ts
export type NodeExecutor<TData = Record<string, unknown>> = (
  params: NodeExecutorParams<TData>,
) => Promise<{ context: WorkflowContext; branch?: string }>;
```

`branch: undefined` means "propagate to all outgoing connections regardless
of `fromOutput`" — the existing behavior for every current node type.

Existing executors updated (one-line change each, no behavior change since
neither returns a `branch`):
- `manualTriggerExecutor`: `return { context: result }`
- `HttpRequestExecutor`: `return { context: response }`

## Execution engine change (`src/inngest/function.ts`)

Replace the unconditional `for (const node of sortedNodes)` loop with a
reachability-filtered version. `topologicalSort` and its cycle detection are
unchanged — this only adds a filter on top of the order it already produces.

```ts
const outputsByNode = new Map<string, Connection[]>();
for (const conn of workflow.connections) {
  const list = outputsByNode.get(conn.fromNodeId) ?? [];
  list.push(conn);
  outputsByNode.set(conn.fromNodeId, list);
}

const hasInbound = new Set(workflow.connections.map((c) => c.toNodeId));
const reachable = new Set(
  sortedNodes.filter((n) => !hasInbound.has(n.id)).map((n) => n.id),
);

let context = event.data.initialData || {};

for (const node of sortedNodes) {
  if (!reachable.has(node.id)) continue;

  const executor = getExecutor(node.type as NodeType);
  const result = await executor({
    data: node.data as Record<string, unknown>,
    nodeId: node.id,
    context,
    step,
  });
  context = result.context;

  const activeHandle = result.branch
    ? `${node.id}-${result.branch}-source`
    : undefined;

  for (const conn of outputsByNode.get(node.id) ?? []) {
    if (!activeHandle || conn.fromOutput === activeHandle) {
      reachable.add(conn.toNodeId);
    }
  }
}
```

Roots (nodes with no inbound connection — trigger nodes) seed `reachable`,
mirroring how `topologicalSort` already treats them as having no
dependency.

**Fan-in behavior:** a node reachable via multiple incoming connections
(e.g. downstream of both IF branches, or fed by two always-run parallel
nodes) becomes reachable as soon as *any* qualifying incoming connection
fires, and executes exactly once (topological order + `Set` semantics
prevent double-execution). This does **not** wait for all inbound branches
to arrive before running — acceptable for this pass since branches are
mutually exclusive by construction (only one side of an IF is ever taken),
so a merge node downstream of both branches always has exactly one live
predecessor per run. True multi-input synchronization (waiting for N of M
required inputs) is out of scope.

## Error handling

- Missing/unresolvable `value` or `compareValue` (non-`isEmpty` operators):
  `NonRetriableError`, consistent with `HttpRequestExecutor`'s existing
  validation style (fail fast, don't retry a data problem).
- `greaterThan`/`lessThan` on non-numeric operands after coercion:
  `NonRetriableError`.
- A node type with no registered executor: unchanged, existing
  `getExecutor` throw applies.

## Testing

No test runner exists in the repo yet (`package.json` has no
`vitest`/`jest`/etc.). Since `bun` is already the package manager, use
`bun test` — no new dependency required. Add a `"test": "bun test"` script.

Coverage for this change:
- `resolve-template.test.ts`: dot-path resolution, missing key →
  `undefined`, mixed string interpolation, whole-string single-template
  type preservation.
- `if/executor.test.ts`: one case per operator (including the two coercion
  failure cases), plus the two "unresolvable value/compareValue" error
  cases.
- `function.test.ts` (or a focused `reachability.test.ts` extracting the
  loop into a testable unit): linear graph (baseline, no regression), IF
  with both branches wired (only taken branch's nodes execute — assert via
  a spy/mock executor call count), IF with only one branch wired, fan-in
  after a branch, and the existing cyclic-graph rejection (regression check
  for the self-loop fix in `003634b`).

## Explicitly out of scope for this spec

- `Switch` node (multi-output, matched by value) — next natural extension,
  same `branch` mechanism generalizes to it.
- Multi-condition IF with AND/OR grouping — single condition only.
- True multi-input fan-in synchronization (wait-for-all-required-inputs).
- Credential/OAuth system and the GitHub/Google/Slack/Outlook integration
  nodes — separate sub-projects, sequenced after this one.
