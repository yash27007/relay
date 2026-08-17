# Execution Inspector — Design Spec

Date: 2026-08-17
Status: Approved for planning
Scope: capture per-node input/output data during workflow execution, surface
it in the canvas as a click-to-open drawer with live and post-hoc status
badges, add a variable picker to every node dialog that accepts
`{{template}}` expressions, and connect `/executions` to a read-only replay
of the canvas for a past run. Explicitly excludes: re-running or retrying a
single node from history, editing a workflow while viewing a past run,
exporting execution data, and any change to the actual variable-storage
mechanism inside executors (investigated — it's already correct; see
Context).

## Context

Execution history already persists at the run/step level:
`WorkflowRun`/`WorkflowRunStep` (added for the Executions page) record
status, timing, and error per node, written by `recordStep` — an optional
callback threaded through `runWorkflow` (`src/inngest/run-workflow.ts`) and
implemented in `src/inngest/function.ts` as `record-step-${status}-${nodeId}`
Inngest steps, one `upsert` per status transition. What's missing is the
actual data: `WorkflowRunStep` has no column for what a node received or
produced, so `/executions`' detail Sheet
(`src/features/executions/components/execution-detail-sheet.tsx`) can only
show a status/timing timeline, never a payload.

Live status already reaches the canvas: `runWorkflow` publishes
`loading`/`success`/`error` over `workflowRunChannel` (`@inngest/realtime`),
and `useWorkflowExecutionStatus` applies each message to local node state in
`Editor` while a run is in flight. This is transient — closing or
reloading the editor loses it, since nothing re-hydrates node status from
persisted history on mount. `BaseNode` (`src/features/workflows/nodes/react-
flow/base-node.tsx`) already renders a small status icon (check/X/spinner)
from that transient state; both `BaseExecutionNode` and `BaseBranchNode`
delegate to it, so every one of the 13 registered node types already gets
this icon for free.

Variable resolution itself has no bug: `resolveTemplate`
(`.../lib/resolve-template.ts`) walks `{{a.b.c}}` against the shared
`WorkflowContext`, and every executor — `HttpRequestExecutor`,
`createAiExecutor` (shared by all 8 AI-provider nodes), the Agent executor —
consistently returns `{ context: { ...context, [data.variableName]: payload
} }`. A node with `variableName: "myHttp"` really does produce
`{{myHttp.httpResponse.data}}`; a node with `variableName: "myAi"` really
does produce `{{myAi.text}}`. The gap is discoverability: every field that
accepts a template expression (`AiFormValues.userPrompt`/`systemPrompt`,
`IfFormValues.value`/`compareValue`, `SwitchFormValues.value`/case values,
`HttpRequestData.endpoint`/`body`) is a plain `Textarea`/`Input` with no
indication of what's available upstream, so users guess at shapes instead
of being shown them.

Two structural gaps block everything above from becoming a real "execution
inspector": `workflowsRouter.execute` fires the Inngest event and returns
the bare `Workflow` row — the frontend never learns the `WorkflowRun.id`
that event produces, so it can't ask "how did that run go?" without
polling. And `/executions` has no path into the canvas at all — its Sheet
is a flat list, disconnected from `Editor`.

## 1. Data capture

### Schema

`WorkflowRunStep` gains two nullable columns:

```prisma
model WorkflowRunStep {
  // ...existing fields unchanged...
  input  Json?
  output Json?
}
```

Nullable because rows written at the `loading` transition have neither yet,
and existing rows from before this migration have both `null` — the UI
treats a `null` input/output as "not captured for this step" rather than
an error.

### Run-ID correlation

`workflowsRouter.execute` currently just sends the Inngest event and
returns the `Workflow` row (`data.name` is read by
`useExecuteWorkflow`'s success toast). It changes to create the
`WorkflowRun` row itself, synchronously, before sending the event:

```ts
execute: protectedProcedure
  .input(z.object({ id: z.string() }))
  .mutation(async ({ ctx, input }) => {
    const workflow = await ctx.prisma.workflow.findFirstOrThrow({
      where: { id: input.id, userId: ctx.auth.user.id },
    });
    const run = await ctx.prisma.workflowRun.create({
      data: { workflowId: input.id, userId: ctx.auth.user.id, status: "RUNNING" },
    });
    await inngest.send({
      name: "workflows/execute.workflow",
      data: { workflowID: input.id, runId: run.id },
    });
    return { workflow, runId: run.id };
  }),
```

`src/inngest/function.ts`'s `record-run-start` step is removed (the row
already exists); it instead reads `event.data.runId` and uses it directly
everywhere it currently uses `run.id`. `useExecuteWorkflow`'s `onSuccess`
callback updates its one read of `data.name` to `data.workflow.name`
— the only existing call site this return-shape change touches.

### Input/output capture — generic, not per-executor

`runWorkflow`'s loop already has `context` (the value right before calling
an executor) and `result.context` (right after). That's exactly INPUT and
the source for OUTPUT, computed once in the loop — no executor changes:

```ts
const input = context;
// ...call executor, get `result`...
const output = diffContext(input, result.context); // new/changed top-level keys only
```

`diffContext` is a small pure function (new file, e.g.
`src/inngest/lib/diff-context.ts`, or colocated in `run-workflow.ts` if
small enough to stay a private helper) comparing two `WorkflowContext`
objects by top-level key and returning only the keys that are new or whose
reference/value changed. For every existing executor this reduces to
exactly `{ [variableName]: value }`, since every executor spreads
`...context` and adds exactly one new key — but it stays correct even for
a hypothetical future executor that touches more than one key, without
needing to know anything about *which* executor ran.

`recordStep`'s signature gains `input`/`output`:

```ts
recordStep?: (event: {
  nodeId: string; nodeName: string; nodeType: string;
  status: "loading" | "success" | "error"; error?: string;
  input?: WorkflowContext; output?: WorkflowContext;
}) => Promise<void>;
```

Passed only at the `success`/`error` transitions (the `loading` call has no
output yet, and passing `input` there would be redundant with the
`success`/`error` row for the same step, which `upsert` overwrites anyway).

**Size safety.** Before writing, `function.ts`'s `recordStep` implementation
JSON-serializes the snapshot; if it exceeds a fixed threshold (128KB —
comfortably above any real prompt/HTTP-response payload this app currently
produces, per the AI Node Upgrade and HTTP executor's existing behavior,
while still bounding worst case), it stores `{ truncated: true, byteLength
}` instead of the real payload. This check lives in the one place
`recordStep` is implemented, not in `runWorkflow` or any executor — matching
the existing best-effort/non-throwing contract (`.catch(() => {})`) this
callback already has: a recording failure, or a payload too large to
record, must never mask the executor's real error or interrupt the run.

## 2. Node Output Drawer + canvas badges

### Making the run known to the editor

`ExecuteWorkflowButton`'s `useExecuteWorkflow().mutate` now resolves with
`{ workflow, runId }`. `Editor` keeps that `runId` in local state
(`useState<string | null>`), set the moment a run starts — this is what the
drawer (and, in section 4, replay mode) key off for the rest of the
session, no separate "find the latest run" query needed for a live session.
Badge *status* itself is unaffected by any of this: it keeps coming from
the existing `useWorkflowExecutionStatus` realtime subscription exactly as
today, unchanged — `runId` only exists to answer "which run's input/output
should the drawer fetch," never to drive the status icon itself.

### Selecting a node to inspect — a shared atom, not prop-threading

`BaseNode`'s existing status icon (the check/X/spinner already rendered at
the node's corner) becomes a `<button>` (guarded with
`event.stopPropagation()` so clicking it doesn't also trigger the node's
own selection/drag handlers) that writes the node's id to a new Jotai atom,
`selectedOutputNodeIdAtom` (`src/features/workflows/editor/store/atoms.ts`,
alongside the existing `editorAtom`). This needs `id` to reach `BaseNode`,
which today only receives `status`; `BaseExecutionNode` and
`BaseBranchNode` (the only two callers) start passing `id={id}` down
alongside `status`. Three files touched (`base-node.tsx`,
`base-execution-node.tsx`, `base-branch-node.tsx`); every one of the 13
node types gets a clickable badge for free, exactly like they already get
the status icon for free today.

The badge is only rendered clickable when `status` is `"success"` or
`"error"` (never `"loading"` or `"initial"` — there's nothing to show yet).

### The drawer

`NodeOutputDrawer` (new, `src/features/workflows/editor/components/node-
output-drawer.tsx`) mounts once inside `Editor`, reads
`selectedOutputNodeIdAtom`, and — when both a selected node id and a known
`runId` exist — fetches `executions.getById({ id: runId })` (existing
procedure, now returning `input`/`output` per step since section 1 extends
it) and renders that node's step as two labeled JSON panels, INPUT and
OUTPUT, using the same `pre`/syntax-highlighted-JSON treatment as the
HTTP/AI dialogs' existing `font-mono` textareas for visual consistency. A
step with `output: { truncated: true, byteLength }` renders a one-line
notice instead of a payload. Closing the drawer clears the atom.

This reuses `getById` as-is rather than adding a narrower
`getStep({runId, nodeId})` procedure: the whole run's steps are already one
query, already cached by React Query once fetched, and picking one step out
of a small array client-side is simpler than a second procedure with its
own ownership check to maintain.

## 3. Variable picker

A new shared component, `VariablePicker` (`src/features/workflows/nodes/
executions/components/variable-picker.tsx`), rendered as a small icon
button next to every field that accepts `{{template}}` expressions:
`AiFormValues.userPrompt`/`systemPrompt` (AI + Agent dialogs, which share
this shape), `IfFormValues.value`/`compareValue`, `SwitchFormValues.value`
and its case values, `HttpRequestData.endpoint`/`body`.

**Discovering available variables.** `VariablePicker` takes the current
node's `id` and calls `useReactFlow().getNodes()`/`getEdges()` to walk
backward: starting from `id`, follow every incoming `Edge` whose
`targetHandle` does *not* end in `-tool-target` (the same convention
`isToolConnection` encodes server-side, applied client-side against
`Edge.targetHandle` instead of `Connection.toInput` — same rule, different
runtime shape, no shared code needed) to that edge's `source` node,
transitively, collecting every ancestor. Nodes without a `data.variableName`
(triggers, IF, Switch) are skipped — they don't produce a referenceable
variable.

**Shape per ancestor.** If the workflow has a completed run (`runId` known,
from the same editor state as section 2), the picker fetches that run's
steps once (shared query with the drawer — same `executions.getById` call,
same React Query cache entry, not a second fetch) and shows the *real*
captured output keys for each ancestor that ran successfully. For an
ancestor with no run yet, or one that hasn't executed in the current run,
it falls back to a small static per-`NodeType` shape map (e.g.
`HTTP_REQUEST` → `httpResponse.status`, `httpResponse.statusText`,
`httpResponse.data`; every AI-provider type + `AGENT` → `text`) — good
enough to write a working expression before ever running the workflow,
same as today except now offered instead of guessed.

**Inserting.** Clicking a suggestion inserts `{{path}}` at the field's
current cursor position (via the field's DOM ref + `selectionStart`/
`selectionEnd`, then `field.onChange` with the spliced value) rather than
only appending — editing an existing expression stays natural.

## 4. Read-only replay from `/executions`

Each row in `ExecutionsList` (and the existing detail Sheet) gains a "View
in canvas" link to `/workflows/[id]?run=<runId>`. The `run` param is
managed the same way `page`/`pageSize` already are for the executions list
— a `nuqs` search-param, added to the workflow editor route's own params
module.

`Editor` reads it on mount and, when present, initializes the same `runId`
state section 2 introduced from this param instead of leaving it `null`
until a live run starts. It then calls `useSuspenseExecution(runId)`
(existing hook) to hydrate every node's `data.status` from that run's
steps (same shape `useWorkflowExecutionStatus` already produces, so the
existing status-icon rendering path needs no change) instead of waiting for
a live execution. Because `NodeOutputDrawer` and `VariablePicker` (sections
2–3) already key off that same `runId` state rather than "is a run
currently live," neither needs any replay-specific branch — they work
unmodified whether `runId` arrived from a just-started live run or from
this param.

Read-only means: `nodesDraggable={false}`, `nodesConnectable={false}`,
`edgesReconnectable={false}` on the `ReactFlow` element; `useAutosave` is
skipped entirely (not called, not just disabled — a replay session must
never write back to the workflow's saved nodes/edges); `AddNodeButton` and
`ExecuteWorkflowButton` are not rendered. A normal editor visit (no `run`
param) is entirely unaffected — status starts blank and only ever
populates from a live run started in that session, exactly like today.

If `runId` doesn't belong to the workflow being viewed, doesn't exist, or
isn't owned by the current user, `getById`'s existing `findFirstOrThrow` +
`userId` scoping throws — surfaced by the editor route's existing
`ErrorBoundary`, no new error path.

## Error handling

- Every new write (`recordStep`'s `input`/`output`, the size-cap check) stays
  inside the existing best-effort `.catch(() => {})` wrapper in
  `function.ts` — a data-capture failure never masks the executor's real
  error or fails the run. This is the same rule the plan that introduced
  `recordStep` already established for status/timing.
- `workflowsRouter.execute` creating the `WorkflowRun` row is *not*
  wrapped best-effort — if that write fails, the mutation should fail
  before the Inngest event is even sent, rather than silently running a
  workflow with no way to inspect it.
- Drawer/picker queries reuse `getById`'s existing ownership check; no new
  authorization surface.

## Testing

- `run-workflow.test.ts` gains cases for `diffContext`: unchanged keys are
  excluded, a genuinely new key is included, and (for forward-compatibility)
  a key whose value changed is included — plus assertions that `recordStep`
  is called with the right `input`/`output` shape on the existing
  loading/success/error test cases.
- A new `diff-context.test.ts` (or inline in `run-workflow.test.ts` if
  `diffContext` stays a private helper there) if it's substantial enough
  to warrant isolated cases beyond what the `runWorkflow` tests already
  cover incidentally.
- The ancestor-variable-traversal inside `VariablePicker` is extracted as a
  pure function (`findAncestorVariables(nodes, edges, currentNodeId)`) and
  unit-tested directly with `bun:test` — no React Flow instance needed to
  test graph-walking logic.
- No new tRPC router tests, matching this codebase's existing convention
  (no test-database harness; correctness comes from `ctx.auth.user.id`
  scoping on every procedure, verified by code review the same way every
  other procedure already is).
- UI pieces (drawer, badges, picker popover, replay mode) are verified
  manually — this environment has no browser/screenshot tool, consistent
  with how every other UI-heavy task in this codebase's history has been
  verified (`tsc`, reading the rendered HTML/compiled output, and careful
  code review).

## Migration

One additive Prisma migration: two new nullable columns
(`WorkflowRunStep.input`, `WorkflowRunStep.output`). No existing table is
altered, no existing column's type or nullability changes. Run via the
project's existing `bun run migrate:dev`.
