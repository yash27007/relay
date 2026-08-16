# Live Execution Status — Design Spec

Date: 2026-08-16
Status: Approved for planning
Scope: live per-node status feedback on the workflow canvas while a workflow
runs. Explicitly excludes a persisted execution-history page (the dead
`/executions` stub) and a per-node output-data viewer — both are separate,
later design passes.

## Context

Every node executor in this codebase already carries `// TODO PUBLISH
loading state` / `// TODO Publish success State` comments, and every node's
canvas component already accepts a `status` prop (`"initial" | "loading" |
"success" | "error"`) rendered via the existing `NodeStatusIndicator`
component (border/overlay styling) — but every node component currently
hardcodes `const nodeStatus = "initial"`, so none of this ever reflects a
real run. This spec wires that existing, unused UI up to the real Inngest
execution engine.

## Prerequisite research (verified, not assumed)

- **Cost:** Inngest Realtime is included on the free Hobby plan (50
  concurrent connections, 250k messages/day) — confirmed against
  inngest.com/pricing. No paid tier required at this app's scale.
- **Package/version:** `@inngest/realtime@0.4.7` depends on `inngest:
  ^3.42.3`, matching this repo's installed `inngest@3.49.1` exactly. No core
  `inngest` upgrade needed (the newer bundled-into-core realtime API
  described in Inngest's current docs belongs to `inngest@4.x`, not what's
  installed here).
- **API surface** (from the installed package's own `.d.ts` files, not
  assumed from docs):
  - `channel(idOrFn).addTopic(topic("name").schema(zodSchema))` — from
    `@inngest/realtime`
  - `realtimeMiddleware()` — from `@inngest/realtime/middleware`; once added
    to the `Inngest` client's `middleware` array, injects a `publish`
    function directly onto every function handler's top-level context
    (alongside `event`/`step`) — **not** onto `step`, and not something an
    executor gets automatically.
  - `getSubscriptionToken(inngestClient, {channel, topics})` — from
    `@inngest/realtime`, server-side, returns a token scoped to one
    channel's named topics.
  - `useInngestSubscription({token, refreshToken, ...})` — from
    `@inngest/realtime/hooks`, client-side, returns `{data, latestData,
    freshData, error, state}`.

## Key design decision: centralize publishing in `runWorkflow`, not per-executor

Because `publish` arrives on the function handler's context (not `step`),
and every executor call already goes through `runWorkflow`'s single loop,
status publishing can wrap every executor call **uniformly, in one place** —
`runWorkflow` publishes `"loading"` before calling an executor and
`"success"`/`"error"` after, regardless of node type. This means:

- None of the 8 existing executors change. Their `// TODO PUBLISH...`
  comments are deleted as resolved, not implemented per-file.
- Every future node type gets status publishing for free — there's no
  per-executor step to forget.
- The alternative (giving each executor a `publishStatus` param, per
  nodebase's reference implementation, which does this per-provider) was
  considered and rejected: it means N executors each need updating and each
  can independently get it wrong (wrong status, forgotten error path),
  where centralizing means correctness is provable once.

## Backend changes

### `src/inngest/client.ts`

```ts
import { Inngest } from "inngest";
import { realtimeMiddleware } from "@inngest/realtime/middleware";

export const inngest = new Inngest({
  id: "relay",
  middleware: [realtimeMiddleware()],
});
```

### `src/inngest/channels/workflow-run.ts` (new)

```ts
import { channel, topic } from "@inngest/realtime";
import { z } from "zod";

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

### `src/inngest/run-workflow.ts`

`RunWorkflowParams` gains two fields: `workflowID: string` and `publish:
Realtime.PublishFn` (the raw function injected by the middleware, passed
through unchanged from `function.ts`). Inside `runWorkflow`, before the main
loop:

```ts
const ch = workflowRunChannel(workflowID);
const publishStatus = (nodeId: string, status: "loading" | "success" | "error") =>
  publish(ch.status({ nodeId, status }));
```

The loop body changes from:

```ts
const result = await executor({ data: ..., nodeId: node.id, context, step, userId });
```

to:

```ts
await publishStatus(node.id, "loading");
let result: NodeExecutorResult;
try {
  result = await executor({ data: ..., nodeId: node.id, context, step, userId });
} catch (error) {
  await publishStatus(node.id, "error");
  throw error;
}
await publishStatus(node.id, "success");
```

The `try/catch` re-throws after publishing — this does not change error
behavior (a `NonRetriableError` from an executor still aborts the run the
same way), it only adds a status message on the way out. `NodeExecutorParams`
and every executor's signature are unchanged by this spec.

### `src/inngest/function.ts`

The Inngest function handler already destructures `{event, step}`; add
`publish` to that destructuring (available because of the middleware) and
pass both `workflowID` and `publish` into `runWorkflow(...)`.

### tRPC: `workflowsRouter.getRealtimeToken`

New `protectedProcedure` in `src/features/workflows/server/index.ts`,
mirroring `execute`'s ownership check (`findFirstOrThrow({id, userId:
ctx.auth.user.id})` before issuing anything) so a user can never get a
subscription token for a workflow they don't own:

```ts
getRealtimeToken: protectedProcedure
  .input(z.object({ id: z.string() }))
  .query(async ({ ctx, input }) => {
    await ctx.prisma.workflow.findFirstOrThrow({
      where: { id: input.id, userId: ctx.auth.user.id },
    });
    return getSubscriptionToken(inngest, {
      channel: workflowRunChannel(input.id),
      topics: ["status"],
    });
  }),
```

## Frontend changes

### New hook: `useWorkflowExecutionStatus(workflowID)`

Lives alongside the other workflow hooks. Wraps `useInngestSubscription`:

```ts
const { freshData } = useInngestSubscription({
  token: () => trpcClient.workflows.getRealtimeToken.query({ id: workflowID }),
  refreshToken: () => trpcClient.workflows.getRealtimeToken.query({ id: workflowID }),
  enabled: true,
});
```

Returns `freshData` (only-new-since-last-render messages) filtered/typed to
`{nodeId, status}[]` for the `status` topic.

### `Editor` component

- Subscribes via the hook above for the whole time the editor is mounted
  (not gated behind "just clicked Execute") — a workflow run triggered any
  other way (future: webhook) still shows live on the canvas if the editor
  happens to be open.
- A `useEffect` watching the subscription's fresh messages merges each
  `{nodeId, status}` into that node's `data.status` via `setNodes`.
- `ExecuteWorkflowButton` gains an `onExecuteStart` callback prop; `Editor`
  passes a handler that resets every node's `data.status` to `"initial"`
  before the mutation fires, so a re-run doesn't show stale results from a
  previous one while waiting for the first real status message to arrive.

### Node components

5 files read `props.data?.status` instead of a hardcoded `"initial"`
literal (falling back to `"initial"` when absent): `if-node.tsx`,
`switch-node.tsx`, `http-request-node.tsx`, `manual-trigger.tsx`, and
`ai-node.tsx` (covers all 4 AI providers, since they share one factory).
`BaseExecutionNode`/`BaseTriggerNode`/`BaseBranchNode` and
`NodeStatusIndicator` are unchanged — they already accept and render
`status` correctly; only the value fed into them was wrong.

## Error handling

- A thrown `NonRetriableError` (or any error) inside an executor: `runWorkflow`
  publishes `"error"` for that node, then re-throws. The status publish
  itself is best-effort — its own failure is swallowed rather than allowed
  to replace the executor's real error as what the run fails with.
- **Amendment (post-launch whole-branch review, 2026-08-16):** the original
  claim that publishing "only adds a status message" and leaves Inngest's
  retry/failure behavior otherwise unchanged is not quite accurate.
  `realtimeMiddleware()` wraps every `publish()` call made from outside an
  active step in its own durable `step.run(...)` (confirmed by reading
  `node_modules/@inngest/realtime/middleware.mjs`) — `runWorkflow` calls
  `publishStatus` from the function body, not from inside a step, so this
  applies to every single status publish. Accepted, documented trade-off:
  each executed node now costs 2 extra durable steps (loading + terminal),
  roughly tripling total step count per run, with proportional latency and
  step-quota impact — acceptable at this app's current scale (see the
  Realtime cost note above; step usage is a separate Inngest quota not yet
  a concern here). If step volume becomes a problem, revisit by giving
  publishes unique step ids or by publishing from inside an existing step.
- A subscription/token error client-side (network issue, expired token):
  surfaced via `useInngestSubscription`'s `error`/`state` return values.
  This spec does not add UI for connection-state display (e.g. a "live" /
  "reconnecting" indicator) — out of scope, YAGNI for a first pass. A silent
  reconnect (the hook's `refreshToken` path) is sufficient; nodes simply
  stop updating if the subscription is down, which is a acceptable, low-risk
  degradation rather than a broken workflow.
- Untaken-branch nodes (e.g. an IF's false side when true was taken) never
  receive any status message during a run — per the reset-on-execute
  behavior above, they show `"initial"`, not a stale status from a
  different node's earlier run, and not a misleading "skipped" status this
  spec doesn't introduce.

## Testing

- `runWorkflow`'s new publish-wrapping logic is testable the same way its
  existing reachability logic is: a fake `publish` function recording calls,
  asserting `["loading", "success"]` (or `["loading", "error"]` for a
  throwing executor) in order, for both a simple linear case and a branch
  case (untaken-branch nodes never get a `publishStatus` call at all, since
  they're skipped entirely — same reachability check as today).
- No new test infrastructure needed; `run-workflow.test.ts`'s existing
  `fakeStep` pattern extends naturally to a `fakePublish`.
- Frontend (`Editor`'s subscription wiring, node components reading
  `data.status`) has no automated test coverage, matching this codebase's
  existing convention of not testing UI-only wiring — verified manually
  (run a workflow with the dev servers up, watch node borders change
  live) as the acceptance check, same as prior UI work this session.

## Explicitly out of scope

- Persisted execution history (`/executions` page, an `Execution`/
  `NodeExecution` Prisma model, retention policy) — separate design pass,
  since it needs its own schema decisions independent of this spec.
- Per-node output-data viewer (click a node, see its resolved input/output
  JSON) — separate design pass; this spec only carries `{nodeId, status}`,
  not node output data, over the realtime channel.
- Connection-state UI (live/reconnecting indicator) — YAGNI for a first
  pass, noted above.
- Any change to `NodeExecutorParams`, existing executor signatures, or
  retry/error semantics beyond adding a status message on the way out of a
  thrown error.
