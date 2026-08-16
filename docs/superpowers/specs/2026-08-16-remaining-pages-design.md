# Remaining Pages — Design Spec

Date: 2026-08-16
Status: Approved for planning
Scope: four pages that close out the app's navigation surface — a public
marketing Landing page, a real Executions history page (list + per-node
timeline), a Profile page (account/security settings), and a Billing page
(surfacing the Polar subscription that's already wired up server-side).
Explicitly excludes: email change flow, avatar upload, per-node retry/
re-run from the executions view, and any new paid infrastructure — Polar
is already installed and configured on this branch, nothing new is added.

## Context

Today, `/` is dead dev-test code (`src/app/page.tsx` calls
`trpc.getWorkflows`/`executeAi`/`createWorkflow`, none of which exist on
the current `appRouter` — see `src/trpc/routers/_app.ts`), `/executions`
is a one-line stub (`<p>Executions</p>`), and there is no `/profile` or
`/billing` route at all. The app otherwise follows a consistent
feature-folder shape — `src/features/<name>/{server,components,hooks}` —
and a consistent page shape (`requireAuth()` → `prefetch(...)` →
`HydrateClient` → `Suspense`/`ErrorBoundary` around a client list
component), demonstrated by `src/app/(dashboard)/(others)/credentials/page.tsx`
and `.../workflows/page.tsx`. All four new pages follow that shape.

Workflow execution itself already runs durably through Inngest
(`src/inngest/function.ts` → `runWorkflow` in `src/inngest/run-workflow.ts`),
publishing live per-node status over an `@inngest/realtime` channel
(`workflowRunChannel`) that the editor subscribes to while open — but
nothing about a run is ever persisted. That's the gap the Executions page
closes.

Billing is further along than it looks: `@polar-sh/better-auth`'s
`checkout`/`portal` plugins are already registered in `src/lib/auth.ts`,
`useSubscription`/`useHasActiveSubscription` already exist in
`src/components/subscriptions/hooks/use-subscription.ts`, and the sidebar
already calls `checkout({ slug: "pro" })` for upgrades. The only thing
actually broken is the sidebar's "Billing Portal" button, whose `onClick`
is a no-op (`onClick={() => {}}`).

## 1. Landing page

`src/app/page.tsx` becomes a public marketing page: hero, feature
highlights (visual workflow builder, AI provider nodes, integrations),
CTAs to `/signup` and `/login`. No backend — static content, split into
small components under `src/features/marketing/components/` (hero,
features, footer) so `page.tsx` stays a thin composition, matching this
codebase's file-size norms. Visual direction goes through the
frontend-design skill (this is the one page whose whole job is a strong
first impression) but stays on the app's existing design tokens —
`globals.css`'s theme colors/radius, `Inter`/`Poppins` fonts already
loaded in `src/app/layout.tsx` — rather than introducing a separate
marketing palette.

**Hero animation.** The hero's centerpiece is a looping SVG diagram of a
workflow actually executing: three nodes left-to-right — Trigger
(`MousePointerIcon`, the exact icon `node-selector.tsx` uses for Manual
Trigger) → HTTP Request (`GlobeIcon`, ditto) → an AI provider node
(`/gemini.svg` or `/anthropic.svg`, the real logos already in `public/`,
rendered through the same squircle badge `NodeIcon` uses) — connected by
two paths. A pulse travels along each path in sequence (SVG
`stroke-dasharray`/`stroke-dashoffset` animation, not a JS animation
library — no new dependency), and each node highlights as the pulse
reaches it, echoing the same loading→success visual language the real
editor already uses for live node execution
(`workflowRunChannel`'s `status` topic). Pure CSS/SVG, respects
`prefers-reduced-motion` (freezes on the "all three nodes succeeded"
frame rather than looping), client component since it's animated:
`src/features/marketing/components/workflow-animation.tsx`.

**Footer.** "Developed by Yashwanth Aravind" with a link to
`https://github.com/yash27007` (using the existing `/github.svg` mark),
alongside the standard `/login`/`/signup` links.

An already-authenticated visitor should never see the marketing page —
they should land in the app. `src/lib/auth-utils.ts`'s `requireUnAuth`
currently redirects an authenticated visitor to `/` (used today by
`/login` and `/signup`); since `/` stops being an app page, that target
changes to `/workflows`. The landing page itself calls the same
`requireUnAuth` check so a signed-in user hitting `/` directly also lands
on `/workflows` instead of the marketing page.

**Files:**

- Modify: `src/app/page.tsx` (full rewrite)
- Modify: `src/lib/auth-utils.ts` (`requireUnAuth` redirect target)
- Create: `src/features/marketing/components/{hero,features,site-footer}.tsx`

## 2. Executions page

### Data model

Two new models, additive-only (matches this branch's existing migration
pattern — enums and tables have only ever gained members here, never lost
them):

```prisma
enum RunStatus {
  RUNNING
  SUCCESS
  ERROR
}

model WorkflowRun {
  id          String            @id @default(cuid())
  workflowId  String
  workflow    Workflow          @relation(fields: [workflowId], references: [id], onDelete: Cascade)
  userId      String
  status      RunStatus         @default(RUNNING)
  startedAt   DateTime          @default(now())
  completedAt DateTime?
  error       String?
  steps       WorkflowRunStep[]

  @@index([userId, startedAt])
  @@index([workflowId, startedAt])
  @@map("workflow_run")
}

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

`Workflow` gains a back-relation: `runs WorkflowRun[]`.

`nodeName`/`nodeType` are snapshotted onto the step row at execution time
rather than joined live from `Node`, because a node can be renamed,
retyped, or deleted from the workflow after the run that used it — the
history has to stay meaningful even then. `userId` is denormalized onto
`WorkflowRun` (rather than requiring a join through `Workflow` for every
list query) purely so "list my executions across every workflow" is one
indexed query, the same tradeoff `Credential.userId` already makes
instead of going through `User`.

No cascading data-loss risk: both new tables only ever reference
`Workflow`/`WorkflowRun` with `onDelete: Cascade`, so deleting a workflow
cleanly deletes its run history too, same as it already does for `Node`/
`Connection`.

### Instrumentation

`run-workflow.ts` stays free of Prisma — it's unit-tested today
(`run-workflow.test.ts`, 397 lines) against mocked `step`/`publish`/
`getExecutor`, with no real database. Recording steps is wired the same
way `publish` already is: an injected callback, not a direct import.

`RunWorkflowParams` gains one new field:

```ts
recordStep?: (event: {
  nodeId: string;
  nodeName: string;
  nodeType: string;
  status: "loading" | "success" | "error";
  error?: string;
}) => Promise<void>;
```

Optional so every existing test call site that omits it keeps compiling
and behaving exactly as today (a no-op when absent). Inside the node loop,
call it at the same three points `publishStatus` already is called
(loading before execution, success after, error in the catch path before
rethrow) — mirroring the existing realtime-publish pattern exactly, just
writing to a second sink.

`src/inngest/function.ts` (the actual Inngest function, not unit-tested
against a mock — this is where Prisma is allowed) provides the real
implementation:

- Right after loading the workflow, `step.run("record-run-start", ...)`
  creates the `WorkflowRun` row (`status: "RUNNING"`).
- Passes a `recordStep` closure into `runWorkflow` that does
  `step.run(`record-step-${event.status}-${event.nodeId}`, ...)`,
  upserting a `WorkflowRunStep` — `loading` creates the row, `success`/
  `error` update the existing row's `status`/`completedAt`/`error`. (Using
  `upsert` keyed on a unique `(runId, nodeId)` constraint — added to the
  model above as `@@unique([runId, nodeId])` — makes this safe against
  Inngest replaying a step.)
- After `runWorkflow` resolves, `step.run("record-run-success", ...)` sets
  the `WorkflowRun` to `SUCCESS` with `completedAt`.
- If `runWorkflow` throws, a catch block's `step.run("record-run-error",
  ...)` sets the `WorkflowRun` to `ERROR` with `completedAt` and the
  caught error's message, then rethrows (execution failure reporting to
  Inngest itself is unchanged).

### API

New feature folder `src/features/executions/`, following the
`credentials`/`workflows` shape:

- `server/index.ts` — `executionsRouter` with:
  - `list`: `protectedProcedure`, paginated (same
    `page`/`pageSize`/`PAGINATION` constants as
    `workflows.getAllWorkflows`), optional `workflowId` filter, returns
    runs scoped to `ctx.auth.user.id` joined with the workflow's `name`.
  - `getById`: `protectedProcedure`, input `{ id: string }`, returns one
    run (`findFirstOrThrow` scoped to `userId`) with its `steps` ordered
    by `startedAt`.
- `components/` — list table + detail sheet (below)
- `hooks/use-executions.ts` — thin wrappers over the two procedures

`appRouter` in `src/trpc/routers/_app.ts` gains `executions:
executionsRouter`.

### UI

`src/app/(dashboard)/(others)/executions/page.tsx` replaces the stub with
the standard prefetch/Suspense/ErrorBoundary shape, rendering a table:
workflow name (links to the editor), status badge, started-at (relative
time), duration, and a "View" action. Empty state: "No runs yet — execute
a workflow to see its history here."

Clicking a row opens a `Sheet` (already installed,
`src/components/ui/sheet.tsx`) showing the run's overall status/duration/
error and a vertical step timeline — one row per `WorkflowRunStep` with a
status icon, node name, node type, and its own duration/error. This reuses
the same three-state status vocabulary (`loading`/`success`/`error` →
rendered as pending/success/error) the editor's canvas already uses for
live execution, so the visual language is consistent between "watching a
run happen" and "reading a run's history."

## 3. Profile page

New `src/app/(dashboard)/(others)/profile/page.tsx`, no schema changes —
everything here is a thin wrapper over better-auth client methods that
already exist with no extra plugin (`authClient.updateUser`,
`authClient.changePassword`, `authClient.listSessions`,
`authClient.revokeSession`):

- **Account card** — current display name, editable via a form calling
  `updateUser({ name })`. Email is shown read-only (changing it needs a
  verification flow, explicitly out of scope here).
- **Password card** — current password + new password + confirm, calling
  `changePassword`.
- **Sessions card** — list from `listSessions()`, each row showing
  device/browser info (from the session's `userAgent`, already stored —
  see the `Session` model), created date, and a "Revoke" button
  (`revokeSession`) for every session except the current one (identified
  by comparing session `id`/`token` against `useSession()`'s active
  session — the current session has no revoke button, since revoking your
  own active session is just a confusing way to log out).

Plus `src/features/profile/components/{account-form,password-form,sessions-list}.tsx`
and `src/features/profile/hooks/use-profile.ts` (wraps the four
`authClient` calls in `useMutation`/`useQuery` with toasts, matching the
pattern `use-credentials.ts` already establishes for mutations).

Sidebar gains a "Profile" entry (`src/components/dashboard/app-sidebar.tsx`)
— placed in the footer group above "Billing Portal", matching where
account-level (as opposed to workflow-level) actions already live.

## 4. Billing page

New `src/app/(dashboard)/(others)/billing/page.tsx`, no schema changes,
no new Polar configuration — this page is a real UI on top of
infrastructure that already works:

- **Current plan card** — reads `useHasActiveSubscription()`
  (`src/components/subscriptions/hooks/use-subscription.ts`, unchanged).
  Free: plan name "Free" + "Upgrade to Pro" button calling the existing
  `checkout({ slug: "pro" })`. Pro: plan name "Pro", renewal date, and a
  "cancels on {date}" note when `cancelAtPeriodEnd` is true (both already
  present on `activeSubscriptions[0]`, per the type comment already in
  `use-subscription.ts`).
- **Manage billing button** — calls Polar's hosted customer portal.
  `@polar-sh/better-auth`'s `portal()` plugin (already registered in
  `src/lib/auth.ts`) exposes a `/customer/portal` endpoint on the server;
  the client-side call is `authClient.customer.portal()` (same
  `authClient.customer.*` namespace `useSubscription` already calls
  `.state()` on), which redirects the browser to Polar's hosted portal.

The sidebar's "Billing Portal" button
(`src/components/dashboard/app-sidebar.tsx`) currently has an empty
`onClick`. It becomes a `Link` to `/billing` (matching how every other
sidebar item — Workflows, Credentials, Executions — is already a `Link`,
not an inline action); the actual portal/upgrade actions live on the
billing page itself, not in the sidebar.

## Error handling

All four pages reuse the codebase's existing error idioms — nothing new:
`protectedProcedure` throws `TRPCError({ code: "UNAUTHORIZED" })` for
unauthenticated access (already the pattern for every other procedure);
list/detail queries use `ErrorBoundary`/`Suspense` fallbacks exactly like
`CredentialsList`/`WorkflowsList`; mutations (profile forms, revoke
session) surface failures via `sonner` toasts, matching
`useCreateApiKey`/`useRemoveApiKey` in `use-credentials.ts`. The one new
failure mode — an Inngest run's `record-step-*`/`record-run-*` writes
themselves failing — is handled the same way the existing `publishStatus`
best-effort pattern in `run-workflow.ts` already documents: a recording
failure must never mask or replace the executor's real error, so those
`step.run` calls are wrapped the same defensive way (log and continue,
never let a bookkeeping failure change what the run's actual outcome
was).

## Testing

- `run-workflow.test.ts` gains cases asserting `recordStep` is called with
  the right `nodeId`/`nodeName`/`nodeType`/`status` sequence, using a
  mock callback — no real database touched, consistent with every
  existing test in that file.
- No tRPC router in this codebase has direct unit tests today (not
  `workflowsRouter`, not `credentialsRouter`) — there's no test-database
  harness, and correctness instead comes from every procedure scoping its
  query by `ctx.auth.user.id` (`findFirstOrThrow`/`where: { userId }`,
  never a client-supplied id). `executionsRouter` follows that exact same
  pattern rather than inventing router-level tests this codebase doesn't
  have anywhere else.
- No new tests are written purely for static marketing/profile/billing
  markup; existing patterns in this codebase don't unit-test presentational
  components, and the plan won't invent that convention here.

## Migration

One additive Prisma migration: two new tables (`workflow_run`,
`workflow_run_step`), one new enum (`RunStatus`), one new relation field
on `Workflow`. No existing table is altered. Run via the project's
existing `bun run migrate:dev`.
