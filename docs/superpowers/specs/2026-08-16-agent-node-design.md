# Agent Node — Design Spec

Date: 2026-08-16
Status: Approved for planning
Scope: an n8n-style tool-calling Agent node — a single node type that runs
a multi-step LLM loop, able to call other canvas nodes as tools via a new
connection kind. Explicitly excludes: live per-tool-call status on the
canvas, structured/typed Agent output, tool-capable node types beyond HTTP
Request, and conversation memory across runs — each is a separate,
later design pass.

## Context

Relay already has 4 single-shot AI provider nodes (OpenAI/Anthropic/Gemini/
Groq), sharing a `createAiExecutor`/`createAiNode` factory that resolves
prompt templates, fetches + decrypts a per-user credential, and calls
`generateText` once. The Agent node is a different shape of node entirely:
instead of one `generateText` call, it runs a *loop* — the model can call
zero or more tools, see their results, and call more tools or return a
final answer — mirroring n8n's AI Agent node, which gets its tools from
separate connections into a dedicated tool input.

## Key design decisions

### One `AGENT` node type, not four per-provider Agent nodes

The 4 AI nodes are near-duplicate thin wrappers differing only in
`createModel`, which justified 4 separate node-selector entries. The
Agent's tool-loop logic is identical across providers *and* a single node
with a provider dropdown in its own config dialog is simpler UX than
quadrupling the node-selector — the dropdown filters the existing
`useApiKeysByType` credential picker by the chosen provider, reusing the
credential system exactly as it works today. Requires exactly one addition
to the `NodeType` enum: `AGENT`.

### Tool wiring reuses the existing handle-ID convention — no schema change

Connection routing in this codebase is already driven by handle IDs, not a
DB column: IF/Switch branch routing works by comparing `connection.fromOutput`
against a computed handle string (`${nodeId}-${branch}-source}`), and
`fromOutput`/`toInput` are saved verbatim from React Flow's
`sourceHandle`/`targetHandle` (`src/features/workflows/server/index.ts`
lines 144-145, 199-200) — already free-form strings, not an enum. Tool
connections use the same mechanism: the Agent node gets a second target
handle (`${id}-tool-target`, `Position.Bottom`), and any tool-capable node
gets a second source handle (`${id}-tool-source`, `Position.Bottom`). A
connection between those handle IDs is a *tool* connection, not a *flow*
connection.

`runWorkflow`'s `topologicalSort` and reachability walk filter these out
by checking `connection.toInput?.endsWith("-tool-target")` before
including a connection's edge/reachability effect — tool nodes are never
part of the main linear walk; they're invoked on demand, only by an
Agent's own executor. A tool node with *no* flow connection (only a tool
connection) is naturally excluded from the reachable set already, with no
special-casing needed — the existing reachability computation only seeds
and grows from flow connections.

**No Prisma migration for connections.** The only schema change in this
entire spec is adding `AGENT` to the `NodeType` enum (additive, no
data-loss warning, safe for a normal non-interactive `prisma migrate dev`).

### `BaseExecutionNode` gains an optional `toolCapable` flag

Rather than a bespoke canvas component per tool-capable node type, a new
optional prop on the existing shared `BaseExecutionNode` — `toolCapable?:
boolean` — renders the extra `${id}-tool-source` handle when true. HTTP
Request opts in by passing `toolCapable`; any future node type does the
same with one line, no new component. The Agent node itself is NOT built
on `BaseExecutionNode` (it needs a second *target* handle, a different
shape than `toolCapable`'s second *source* handle) — it gets its own small
canvas component, composed from the same low-level primitives
(`BaseNode`, `BaseNodeContent`, `BaseHandle`, `WorkflowNode`,
`NodeStatusIndicator`) the way `BaseBranchNode` already does for
multi-output nodes.

### Tool parameters: `$fromAI` passthrough, reusing the existing template engine

HTTP Request's config dialog gains a "Use as AI Tool" section: a tool
description (shown to the LLM) and a list of named parameters (name,
type: string/number/boolean, description). These become available inside
that *same node's own* endpoint/body fields as `{{ $fromAI.paramName }}`
— resolved by the exact same `resolveTemplate` engine already used
everywhere (`resolvePath` splits on `.` and walks the context object; a
`$fromAI` key is just another object key, no parser change needed). At
call time, the Agent's executor builds an ephemeral context
(`{...workflowContext, $fromAI: llmArgs}`) and invokes the tool node's
real, unmodified executor with it. All parameters are required (no
optional-parameter UI) — kept deliberately simple for this first version.

This means **any current or future node type becomes tool-usable by
adding the same three things**: the `toolCapable` canvas flag, an
`aiTool?: {description, parameters}` field on its data type, and a "Use as
AI Tool" section in its dialog — no new node types, no executor
duplication. HTTP Request is the only node wired up in this plan; the
mechanism itself is generic.

### Execution: durability and the nested-step problem

`ai@6.0.31`'s `generateText({model, tools, stopWhen: stepCountIs(n)})`
already implements the multi-step tool-call loop natively — no hand-rolled
loop needed. The `tools` map is built from the Agent's connected tool
nodes: one `tool({description, inputSchema, execute})` entry per
connection, where `inputSchema` is a zod object built from the tool's
parameter list and `execute` invokes the connected node's real executor.

This creates a genuine engineering conflict with Inngest's step model,
resolved as follows:

- **HTTP Request's executor calls `step.run(...)` internally.** Calling
  it from inside another `step.run(...)` (nesting) is not supported by
  Inngest's step tooling.
- **The credential fetch is its own `step.run`** (`agent-get-credential-
  ${nodeId}`), exactly matching the existing AI executors' pattern —
  happens once, before the loop starts.
- **The entire tool-loop (the `generateText` call and everything it
  triggers) is wrapped in one `step.run(`agent-run-${nodeId}`, ...)`.**
  This makes the whole loop atomic from Inngest's point of view: either it
  completes and is memoized as a single unit (skipped entirely on any
  later retry of the function), or it fails and re-runs completely fresh
  next attempt — no partial-step memoization to go stale.
- **Inside that step, tool invocations use a lightweight passthrough
  `step` implementation** (`{ run: (_name, fn) => fn() }` — the same
  shape already used as `fakeStep` in `run-workflow.test.ts`, satisfying
  `NodeExecutorParams["step"]`'s type the same way that test file does:
  `as unknown as StepTools`, since the passthrough only implements
  `.run`, not the full real `StepTools` surface), not the real Inngest
  `step` tool. This sidesteps the nesting restriction
  entirely, and avoids a subtler correctness risk: if individual tool
  calls were independently memoized as real Inngest steps, a retry where
  the LLM (non-deterministic) requests a *different* sequence of tool
  calls than its previous attempt could return stale, wrongly-matched
  memoized results for the new call. Wrapping the whole loop atomically
  sidesteps this rather than trying to solve step-identity-under-
  nondeterminism.
- **Cost of this trade-off:** individual tool calls (e.g. an HTTP
  request) are no longer independently retried by Inngest on transient
  failure. `ky` (already used by `HttpRequestExecutor`) retries transient
  failures by default, which covers most of what step-level retry would
  have. A tool call that still fails becomes an error result fed back to
  the model (see Error handling), not a fatal abort — the LLM can react,
  retry itself, or give up gracefully in its own final answer.

### `NodeExecutorParams` gains `getExecutor`

To invoke a connected tool node's real executor, the Agent's executor
needs the same registry lookup `runWorkflow` already has. `getExecutor:
(type: NodeType) => NodeExecutor` is added to `NodeExecutorParams`,
threaded from `runWorkflow` exactly like `userId` already is. Every
existing executor's signature gains access to it but has no reason to use
it — the same shape of change as the `userId`/`step` additions in earlier
work this session.

### Loop limit

A `maxSteps` field on the Agent node (default 5, meaning up to 5 LLM
round-trips per `stepCountIs`'s definition of "step" — one model response
cycle, which may include zero or more tool calls before the next model
call). Client-side input capped at 15; the executor clamps server-side to
the same ceiling regardless of what's stored, so a hand-edited or
API-written value can't exceed it. Since AI credentials are the user's own
(BYO API key), a runaway loop costs the user's own API spend, not Relay's
— the ceiling exists to bound genuinely broken/looping behavior, not
platform cost.

## Data model

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
  AGENT   // new
}
```

`AgentNodeData` (new type, `src/features/workflows/nodes/executions/components/agent/types.ts`):

```ts
export type AgentProvider = "OPENAI" | "ANTHROPIC" | "GEMINI" | "GROQ";

export interface AgentNodeData {
  variableName?: string;
  provider?: AgentProvider;
  credentialId?: string;
  systemPrompt?: string;
  userPrompt?: string;
  maxSteps?: number; // default 5, hard ceiling 15
}
```

`HttpRequestData` gains one new optional field
(`src/features/workflows/nodes/executions/components/http-request/executor.ts`'s
existing local type, and its dialog's form schema):

```ts
export interface AiToolParameter {
  name: string;
  type: "string" | "number" | "boolean";
  description: string;
}

type HttpRequestData = {
  variableName?: string;
  endpoint?: string;
  method?: "GET" | "PUT" | "POST" | "PATCH" | "DELETE";
  body?: string;
  aiTool?: {
    description: string;
    parameters: AiToolParameter[];
  };
};
```

## Canvas / UI

- `src/features/workflows/nodes/executions/components/agent/node.tsx` —
  new small canvas component (not `createAiNode`, doesn't fit that
  factory's per-provider shape): composed from `BaseNode`,
  `BaseNodeContent`, `BaseHandle` (`${id}-target`/`${id}-source`, the
  normal flow handles, plus `${id}-tool-target` at `Position.Bottom`),
  `WorkflowNode`, `NodeStatusIndicator` — same status-reading pattern
  Task 6 of the Live Execution Status plan already established
  (`(props.data?.status as NodeStatus) ?? "initial"`).
- `src/features/workflows/nodes/executions/components/agent/dialog.tsx` —
  provider select (feeding `useApiKeysByType(provider)` for the credential
  picker, matching `ai-dialog.tsx`'s existing pattern), variable name,
  system prompt, user prompt (both template-aware textareas, matching the
  4 AI nodes' dialog), max steps (number input, 1-15).
- `src/features/workflows/nodes/executions/components/agent/executor.ts`
  — the Agent's `NodeExecutor`.
- `BaseExecutionNode` (`src/features/workflows/nodes/executions/components/base-execution-node.tsx`)
  gains `toolCapable?: boolean`, rendering one more `BaseHandle` (`${id}-tool-source`,
  `Position.Bottom`, type `source`) when true.
- HTTP Request's node component passes `toolCapable`; its dialog gains the
  "Use as AI Tool" section (toggle + description + a repeatable
  name/type/description parameter list, add/remove rows).
- `node-selector.tsx` gains one new entry ("AI Agent") in the Actions
  section, icon TBD in planning (a lucide icon, not a provider SVG, since
  the node itself isn't tied to one provider).

## Execution flow (Agent's executor)

1. Validate `variableName`, `provider`, `credentialId`, `userPrompt`
   present — `NonRetriableError` otherwise, matching the 4 AI nodes'
   existing validation style.
2. Clamp `maxSteps` to `[1, 15]`.
3. `step.run(agent-get-credential-${nodeId})`: fetch + return the
   credential row (`select: { value: true }` only, matching the AI
   executors' existing ciphertext-leak-avoidance pattern).
4. Discover connected tool nodes: filter the workflow's connections for
   `toInput === `${nodeId}-tool-target``, resolve each `fromNodeId` to its
   `Node` row. (The full node/connection list needs to reach the Agent's
   executor — threaded the same way `getExecutor` is, via
   `NodeExecutorParams`, since today's `NodeExecutorParams` only carries
   the single node being executed. Concrete shape decided in planning:
   likely `allNodes`/`allConnections` added alongside `getExecutor`.)
5. For each tool node missing `data.aiTool` or its own `variableName`:
   `NonRetriableError` naming the offending node — same
   fail-fast-with-a-clear-message convention as every other executor.
6. Build one `tool()` per connected node: zod `inputSchema` from
   `aiTool.parameters`, `description` from `aiTool.description`,
   `execute(args)` builds the ephemeral `$fromAI` context and calls the
   tool node's real executor via `getExecutor(toolNode.type)` with the
   passthrough `step`.
7. `step.run(agent-run-${nodeId})`: call
   `generateText({model, system, prompt, tools, stopWhen: stepCountIs(maxSteps)})`;
   return `result.text`.
8. Return `{context: {...context, [variableName]: {text}}}` — same shape
   the 4 AI nodes already produce, so downstream template resolution
   (`{{ agentResult.text }}`) works identically to today's AI nodes.

## Error handling

- Missing/invalid Agent config: `NonRetriableError`, fails the node (same
  as today's AI/HTTP nodes) — no tool loop starts.
- A tool node's **runtime** failure (e.g. the target API returning a 500,
  or an argument-dependent 404 — something a differently-parameterized
  retry could plausibly resolve): caught inside that tool's `execute()`,
  returned to the model as a tool-result error object (e.g.
  `{ error: "Request failed with status 500" }`) rather than propagated —
  the LLM continues its loop and can react (retry with different
  arguments, try a different approach, or explain the failure in its final
  answer). This deliberately differs from every other node type's
  fail-the-whole-run convention: a runtime tool failure is domain
  information for the agent, not a workflow-execution failure.
- **Amendment (post-launch task review, 2026-08-16):** a tool node's own
  *configuration* failure — a `NonRetriableError` the tool would also
  throw in the main flow, e.g. HTTP Request's "No endpoint configured" —
  is NOT treated as a retriable tool-result error. No amount of the model
  retrying with different `$fromAI` arguments can fix a static
  misconfiguration, so it aborts the run the same way it would for any
  other node type, rather than letting the model burn its `maxSteps`
  budget retrying something that can never succeed. Only a tool's runtime
  failure gets the error-result treatment described above.
- The `generateText` call itself throwing (model API error, rate limit,
  etc. that survives `ai-sdk`'s own retry): propagates out of the
  `step.run(agent-run-...)` step normally, which `runWorkflow`'s existing
  loop already handles — publishes `"error"` status for the Agent node,
  re-throws, aborts the run. No new error path needed here.
- Loop exhaustion (`stopWhen` triggers because `maxSteps` was reached
  without the model returning a final non-tool-call response): `ai-sdk`
  returns whatever text the model produced at the last step (possibly
  empty). Treated as a successful (if possibly unsatisfying) result, not
  an error — consistent with `stopWhen`'s own semantics (a deliberate
  stop condition, not a failure).

## Testing

- `runWorkflow`'s tool-connection filtering: unit tests (same style as
  the existing branch-routing tests) asserting a tool connection never
  appears in `topologicalSort`'s output ordering and never marks its
  target reachable via the main walk.
- Agent executor: unit tests with a fake `generateText`-equivalent (the
  actual `ai` package isn't mocked at the network level in this
  codebase's existing tests — planning decides the exact mocking
  approach, likely mocking `ai`'s `generateText` export directly) covering:
  validation failures, credential-not-found, a run with zero tools
  (behaves like a single-shot AI node), a run where a tool's `execute()`
  is invoked with the expected `$fromAI`-merged context, and a tool
  invocation that throws surfacing as an error result rather than
  aborting the executor.
- No new frontend automated test coverage, matching this codebase's
  existing convention (UI wiring verified manually).

## Explicitly out of scope

- Live per-tool-call status on the canvas — the Agent node itself still
  shows loading→success/error via `runWorkflow`'s existing central
  publish; what happens inside its tool loop isn't surfaced. Revisit
  alongside a future per-node output/execution-trace viewer.
- Structured/typed Agent output — plain text only, matching the 4 AI
  nodes today.
- Tool-capable node types beyond HTTP Request — the mechanism
  (`toolCapable` flag + `aiTool` data field) is generic; wiring up more
  types is a small addition per type, not a redesign.
- Conversation memory across runs — each execution is a stateless loop;
  no persisted chat history sub-node (n8n's Memory sub-nodes).
- Optional/default-valued tool parameters — all parameters required for
  this first version.
