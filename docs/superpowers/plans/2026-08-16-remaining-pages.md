# Remaining Pages Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Ship the four remaining pages — a public Landing page, a real Executions history page, a Profile (account/security) page, and a Billing page — closing out the app's navigation surface.

**Architecture:** A new `WorkflowRun`/`WorkflowRunStep` persistence layer backs Executions, fed by an injected callback from the existing Inngest execution loop. Profile and Billing are thin UI on top of better-auth/Polar client methods that already work. Landing is a standalone public page with no backend, replacing dead dev-test code at `/`.

**Tech Stack:** Next.js App Router (Server Components + `"use client"` islands), tRPC + React Query (`useSuspenseQuery`), Prisma 7, Inngest (`step.run`), better-auth client, `@polar-sh/better-auth`, shadcn/ui, Tailwind v4, `nuqs` for URL-synced pagination, Bun test.

**Spec:** `docs/superpowers/specs/2026-08-16-remaining-pages-design.md`

## Global Constraints

- Every list/detail query is scoped to `ctx.auth.user.id` via `protectedProcedure` — never a client-supplied id (matches every existing procedure in `workflowsRouter`/`credentialsRouter`).
- No tRPC router in this codebase has direct unit tests (no test-DB harness exists) — don't invent that pattern here. Only `run-workflow.ts` (already unit-tested against mocks) gets new test cases.
- `run-workflow.ts` stays free of Prisma/DB imports — persistence is wired in via an injected callback, exactly like `publish` already is.
- A run/step recording failure must never mask or replace the executor's real error — best-effort only, same rule `publishStatus`'s error-path already follows.
- New Prisma changes are additive only (new tables/enum/relation) — no existing table is altered.
- No new npm dependencies. Every task builds on packages already in `package.json`.
- Landing-page visual work follows the app's existing design tokens (`globals.css` theme colors/radius, `Inter`/`Poppins` fonts from `src/app/layout.tsx`) — no separate marketing palette.
- Run `bun run generate` (or `bun run migrate:dev`, which does this automatically) after any `prisma/schema.prisma` change, and commit the regenerated files under `src/generated/prisma/` — that directory is tracked in git in this repo (verify with `git status` after generating; don't skip committing it).

---

### Task 1: Prisma schema — `WorkflowRun` / `WorkflowRunStep`

**Files:**
- Modify: `prisma/schema.prisma`

**Interfaces:**
- Produces: `RunStatus` enum (`RUNNING`/`SUCCESS`/`ERROR`), `WorkflowRun` model (`id, workflowId, userId, status, startedAt, completedAt, error, steps`), `WorkflowRunStep` model (`id, runId, nodeId, nodeName, nodeType, status, startedAt, completedAt, error`), and `Workflow.runs WorkflowRun[]` — every later task that touches persistence relies on these exact field names.

- [ ] **Step 1: Add the new enum and models**

Open `prisma/schema.prisma`. Find the `Workflow` model (it currently ends with `connections Connection[]` and a closing `}`) and add a `runs` relation field to it, then add the two new models and the enum right after it:

```prisma
model Workflow {
  id          String       @id @default(cuid())
  name        String
  createdAt   DateTime     @default(now())
  updatedAt   DateTime     @updatedAt
  userId      String
  user        User         @relation(fields: [userId], references: [id], onDelete: Cascade)
  nodes       Node[]
  connections Connection[]
  runs        WorkflowRun[]
}

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

Only the `runs WorkflowRun[]` line is new inside `Workflow` — leave every other field in that model untouched.

- [ ] **Step 2: Format the schema**

Run: `bun run prisma:format`

- [ ] **Step 3: Create and apply the migration**

Run: `bun run migrate:dev --name add_workflow_run_history`

This creates a new folder under `prisma/migrations/` and runs `prisma generate` automatically. Expected: the command exits successfully and prints "Your database is now in sync with your schema."

- [ ] **Step 4: Verify the generated client has the new types**

Run: `grep -n "RunStatus" src/generated/prisma/enums.ts`
Expected: a `RunStatus` const/type export, same shape as the existing `NodeType`/`CredentialType` exports in that file.

- [ ] **Step 5: Commit**

```bash
git add prisma/schema.prisma prisma/migrations src/generated
git commit -m "feat: add WorkflowRun/WorkflowRunStep schema for execution history"
```

---

### Task 2: `recordStep` callback in `run-workflow.ts`

**Files:**
- Modify: `src/inngest/run-workflow.ts`
- Modify: `src/inngest/run-workflow.test.ts`

**Interfaces:**
- Consumes: nothing new from Task 1 (this file stays Prisma-free by design).
- Produces: `RunWorkflowParams.recordStep?: (event: { nodeId: string; nodeName: string; nodeType: string; status: "loading" | "success" | "error"; error?: string }) => Promise<void>` — Task 3's `function.ts` implements and passes this in.

- [ ] **Step 1: Write the failing tests**

Open `src/inngest/run-workflow.test.ts`. Add this helper near the top, right after `makeFakePublish`:

```ts
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
```

Then add these two tests inside the `describe("runWorkflow", ...)` block, after the existing `"executes a linear chain in order"` test:

```ts
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
```

- [ ] **Step 2: Run the tests to verify the new ones fail**

Run: `bun test src/inngest/run-workflow.test.ts`
Expected: the three new tests FAIL (`recordStep` is not yet a recognized param / `stepCalls` stays empty), the pre-existing tests still PASS.

- [ ] **Step 3: Implement `recordStep` in `run-workflow.ts`**

In `src/inngest/run-workflow.ts`, add `recordStep` to the `RunWorkflowParams` interface, right after `publish`:

```ts
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
   */
  recordStep?: (event: {
    nodeId: string;
    nodeName: string;
    nodeType: string;
    status: "loading" | "success" | "error";
    error?: string;
  }) => Promise<void>;
}
```

Then update the function body. Add the destructured `recordStep` param and a small helper right after the existing `publishStatus` definition:

```ts
  const ch = workflowRunChannel(workflowID);
  const publishStatus = (nodeId: string, status: "loading" | "success" | "error") =>
    publish(ch.status({ nodeId, status }));
  const recordNodeStatus = (
    node: Node,
    status: "loading" | "success" | "error",
    error?: string,
  ) =>
    recordStep?.({
      nodeId: node.id,
      nodeName: node.name,
      nodeType: node.type,
      status,
      error,
    }) ?? Promise.resolve();
```

(Add `recordStep,` to the destructured parameters at the top of `runWorkflow` too, right after `publish,`.)

Finally, update the execution loop to call `recordNodeStatus` at the same three points `publishStatus` already is:

```ts
    await publishStatus(node.id, "loading");
    await recordNodeStatus(node, "loading");
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
      await recordNodeStatus(node, "error", error instanceof Error ? error.message : String(error));
      throw error;
    }
    await publishStatus(node.id, "success");
    await recordNodeStatus(node, "success");
```

- [ ] **Step 4: Run the tests to verify they pass**

Run: `bun test src/inngest/run-workflow.test.ts`
Expected: PASS, all tests (the three new ones and every pre-existing one).

- [ ] **Step 5: Commit**

```bash
git add src/inngest/run-workflow.ts src/inngest/run-workflow.test.ts
git commit -m "feat: add optional recordStep hook to runWorkflow's execution loop"
```

---

### Task 3: Persist run history in the Inngest function

**Files:**
- Modify: `src/inngest/function.ts`

**Interfaces:**
- Consumes: `RunWorkflowParams.recordStep` from Task 2; `WorkflowRun`/`WorkflowRunStep`/`RunStatus` from Task 1.
- Produces: every `execute-workflow` run now has a `WorkflowRun` row (and one `WorkflowRunStep` row per executed node) that Task 4's `executionsRouter` reads.

- [ ] **Step 1: Rewrite `function.ts`**

Replace the full contents of `src/inngest/function.ts` with:

```ts
import { NonRetriableError } from "inngest";
import { inngest } from "./client";
import { prisma } from "@/lib/db";
import { runWorkflow } from "./run-workflow";
import { getExecutor } from "@/features/workflows/nodes/executions/lib/executor-registry";
import type { Connection, Node } from "@/generated/prisma/client";
import { RunStatus } from "@/generated/prisma/enums";

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

    const run = await step.run("record-run-start", async () => {
      return prisma.workflowRun.create({
        data: {
          workflowId: workflowID,
          userId: workflow.userId,
          status: RunStatus.RUNNING,
        },
      });
    });

    const recordStep = async (event: {
      nodeId: string;
      nodeName: string;
      nodeType: string;
      status: "loading" | "success" | "error";
      error?: string;
    }) => {
      const status =
        event.status === "loading"
          ? RunStatus.RUNNING
          : event.status === "success"
            ? RunStatus.SUCCESS
            : RunStatus.ERROR;
      await step
        .run(`record-step-${event.status}-${event.nodeId}`, async () => {
          await prisma.workflowRunStep.upsert({
            where: { runId_nodeId: { runId: run.id, nodeId: event.nodeId } },
            create: {
              runId: run.id,
              nodeId: event.nodeId,
              nodeName: event.nodeName,
              nodeType: event.nodeType,
              status,
            },
            update: {
              status,
              completedAt: event.status === "loading" ? undefined : new Date(),
              error: event.error,
            },
          });
        })
        // Best effort only — a step-recording failure must never mask the
        // executor's real error. Same rule publishStatus's own error-path
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
            where: { id: run.id },
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
            where: { id: run.id },
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

- [ ] **Step 2: Run the existing test suite to confirm nothing else broke**

Run: `bun test`
Expected: PASS (this file has no dedicated test file of its own — `run-workflow.test.ts` and every executor test file are unaffected by this change, since they don't import `function.ts`).

- [ ] **Step 3: Type-check**

Run: `bunx tsc --noEmit`
Expected: no new errors. (`RunStatus.RUNNING` etc. must resolve — this depends on Task 1's migration having been run in this same worktree.)

- [ ] **Step 4: Commit**

```bash
git add src/inngest/function.ts
git commit -m "feat: persist WorkflowRun/WorkflowRunStep history from execute-workflow"
```

---

### Task 4: Executions backend router

**Files:**
- Create: `src/features/executions/params.ts`
- Create: `src/features/executions/server/index.ts`
- Create: `src/features/executions/server/prefetch.ts`
- Create: `src/features/executions/server/params-loader.ts`
- Modify: `src/trpc/routers/_app.ts`

**Interfaces:**
- Consumes: `RunStatus`/`WorkflowRun`/`WorkflowRunStep` from Task 1.
- Produces: `executionsRouter` with `list`/`getById`, registered on `appRouter` as `executions`; `executionParams` (nuqs page/pageSize state), `prefetchExecutions(params)`, `executionParamsLoader(searchParams)` — Task 5 consumes all four.

- [ ] **Step 1: Create the nuqs params (mirrors `src/features/workflows/params.ts`)**

```ts
// src/features/executions/params.ts
import { parseAsInteger } from "nuqs/server";
import { PAGINATION } from "@/config/constants";

export const executionParams = {
  page: parseAsInteger
    .withDefault(PAGINATION.DEFAULT_PAGE)
    .withOptions({ clearOnDefault: true }),

  pageSize: parseAsInteger
    .withDefault(PAGINATION.DEFAULT_PAGE_SIZE)
    .withOptions({ clearOnDefault: true }),
};
```

- [ ] **Step 2: Create the router**

```ts
// src/features/executions/server/index.ts
import { z } from "zod";
import { PAGINATION } from "@/config/constants";
import { createTRPCRouter, protectedProcedure } from "@/trpc/init";

export const executionsRouter = createTRPCRouter({
  list: protectedProcedure
    .input(
      z.object({
        page: z.number().default(PAGINATION.DEFAULT_PAGE),
        pageSize: z
          .number()
          .min(PAGINATION.MIN_PAGE_SIZE)
          .max(PAGINATION.MAX_PAGE_SIZE)
          .default(PAGINATION.DEFAULT_PAGE_SIZE),
        workflowId: z.string().optional(),
      }),
    )
    .query(async ({ ctx, input }) => {
      const { page, pageSize, workflowId } = input;
      const where = {
        userId: ctx.auth.user.id,
        ...(workflowId ? { workflowId } : {}),
      };
      const [items, totalCount] = await Promise.all([
        ctx.prisma.workflowRun.findMany({
          where,
          skip: (page - 1) * pageSize,
          take: pageSize,
          orderBy: { startedAt: "desc" },
          include: { workflow: { select: { name: true } } },
        }),
        ctx.prisma.workflowRun.count({ where }),
      ]);
      const totalPages = Math.ceil(totalCount / pageSize);
      return {
        items,
        page,
        pageSize,
        totalCount,
        totalPages,
        hasNextPage: page < totalPages,
        hasPreviousPage: page > 1,
      };
    }),

  getById: protectedProcedure
    .input(z.object({ id: z.string() }))
    .query(async ({ ctx, input }) => {
      return ctx.prisma.workflowRun.findFirstOrThrow({
        where: { id: input.id, userId: ctx.auth.user.id },
        include: {
          workflow: { select: { name: true } },
          steps: { orderBy: { startedAt: "asc" } },
        },
      });
    }),
});
```

- [ ] **Step 3: Register on `appRouter`**

In `src/trpc/routers/_app.ts`:

```ts
import { workflowsRouter } from "@/features/workflows/server";
import { credentialsRouter } from "@/features/credentials/server";
import { executionsRouter } from "@/features/executions/server";
import { createTRPCRouter } from "../init";
export const appRouter = createTRPCRouter({
  workflows: workflowsRouter,
  credentials: credentialsRouter,
  executions: executionsRouter,
});
export type AppRouter = typeof appRouter;
```

- [ ] **Step 4: Create the prefetch helper (mirrors `src/features/workflows/server/prefetch.ts`)**

```ts
// src/features/executions/server/prefetch.ts
import type { inferInput } from "@trpc/tanstack-react-query";
import { prefetch, trpc } from "@/trpc/server";

type Input = inferInput<typeof trpc.executions.list>;

export const prefetchExecutions = (params: Input) => {
  return prefetch(trpc.executions.list.queryOptions(params));
};
```

- [ ] **Step 5: Create the params loader (mirrors `src/features/workflows/server/params-loader.ts`)**

```ts
// src/features/executions/server/params-loader.ts
import { createLoader } from "nuqs/server";
import { executionParams } from "../params";

export const executionParamsLoader = createLoader(executionParams);
```

- [ ] **Step 6: Type-check**

Run: `bunx tsc --noEmit`
Expected: no errors.

- [ ] **Step 7: Commit**

```bash
git add src/features/executions/params.ts src/features/executions/server src/trpc/routers/_app.ts
git commit -m "feat: executionsRouter (list/getById) backing the Executions page"
```

---

### Task 5: Executions list UI

**Files:**
- Create: `src/features/executions/hooks/use-execution-params.ts`
- Create: `src/features/executions/hooks/use-executions.ts`
- Create: `src/features/executions/components/executions-list.tsx`
- Modify: `src/app/(dashboard)/(others)/executions/page.tsx`

**Interfaces:**
- Consumes: `executionParams`/`executionsRouter`/`prefetchExecutions`/`executionParamsLoader` from Task 4.
- Produces: `ExecutionsContainer`, `ExecutionsList`, `ExecutionsLoading`, `ExecutionsError` (exported from `executions-list.tsx`) — Task 6 modifies this same file to add row-click detail behavior.

- [ ] **Step 1: Create the params hook**

```ts
// src/features/executions/hooks/use-execution-params.ts
"use client";
import { useQueryStates } from "nuqs";
import { executionParams } from "../params";

export const useExecutionParams = () => {
  return useQueryStates(executionParams);
};
```

- [ ] **Step 2: Create the data hooks**

```ts
// src/features/executions/hooks/use-executions.ts
"use client";
import { useSuspenseQuery } from "@tanstack/react-query";
import { useTRPC } from "@/trpc/client";
import { useExecutionParams } from "./use-execution-params";

/**
 * Hook to fetch the current page of the user's execution history, using
 * suspense — page/pageSize come from the URL (see use-execution-params),
 * same pattern useSuspenseWorkflows follows for workflow pagination.
 */
export const useSuspenseExecutions = () => {
  const trpc = useTRPC();
  const [params] = useExecutionParams();
  return useSuspenseQuery(trpc.executions.list.queryOptions(params));
};

/**
 * Hook to fetch a single execution (with its per-node step timeline),
 * using suspense.
 */
export const useSuspenseExecution = (id: string) => {
  const trpc = useTRPC();
  return useSuspenseQuery(trpc.executions.getById.queryOptions({ id }));
};
```

- [ ] **Step 3: Create the list component**

```tsx
// src/features/executions/components/executions-list.tsx
"use client";
import { formatDistanceToNow } from "date-fns";
import { CheckCircle2Icon, CircleDashedIcon, XCircleIcon } from "lucide-react";
import Link from "next/link";
import type { ComponentType } from "react";
import {
  EntityContainer,
  EntityHeader,
  EntityPagination,
  ErrorView,
  LoadingView,
} from "@/components/dashboard";
import { Badge } from "@/components/ui/badge";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import type { RunStatus } from "@/generated/prisma/enums";
import { useExecutionParams } from "../hooks/use-execution-params";
import { useSuspenseExecutions } from "../hooks/use-executions";

const STATUS_META: Record<
  RunStatus,
  { label: string; icon: ComponentType<{ className?: string }>; className: string }
> = {
  RUNNING: { label: "Running", icon: CircleDashedIcon, className: "text-muted-foreground" },
  SUCCESS: { label: "Success", icon: CheckCircle2Icon, className: "text-emerald-600 dark:text-emerald-400" },
  ERROR: { label: "Error", icon: XCircleIcon, className: "text-destructive" },
};

function formatRunDuration(startedAt: Date | string, completedAt: Date | string | null): string {
  if (!completedAt) return "—";
  const ms = new Date(completedAt).getTime() - new Date(startedAt).getTime();
  if (ms < 1000) return `${ms}ms`;
  const seconds = ms / 1000;
  if (seconds < 60) return `${seconds.toFixed(1)}s`;
  const minutes = Math.floor(seconds / 60);
  const remainingSeconds = Math.round(seconds % 60);
  return `${minutes}m ${remainingSeconds}s`;
}

export const ExecutionsHeader = () => {
  return <EntityHeader title="Executions" description="History of every workflow run." />;
};

export const ExecutionsPagination = () => {
  const executions = useSuspenseExecutions();
  const [params, setParams] = useExecutionParams();
  return (
    <EntityPagination
      disabled={executions.isFetching}
      totalPages={executions.data.totalPages}
      page={executions.data.page}
      onPageChange={(page) => setParams({ ...params, page })}
    />
  );
};

export const ExecutionsContainer = ({ children }: { children: React.ReactNode }) => {
  return (
    <EntityContainer header={<ExecutionsHeader />} pagination={<ExecutionsPagination />}>
      {children}
    </EntityContainer>
  );
};

export const ExecutionsLoading = () => {
  return <LoadingView message="Loading executions..." />;
};

export const ExecutionsError = () => {
  return <ErrorView message="Error loading executions" />;
};

export const ExecutionsList = () => {
  const executions = useSuspenseExecutions();

  if (executions.data.items.length === 0) {
    return (
      <div className="flex flex-1 items-center justify-center py-16">
        <p className="text-sm text-muted-foreground">
          No runs yet — execute a workflow to see its history here.
        </p>
      </div>
    );
  }

  return (
    <Table>
      <TableHeader>
        <TableRow>
          <TableHead>Workflow</TableHead>
          <TableHead>Status</TableHead>
          <TableHead>Started</TableHead>
          <TableHead>Duration</TableHead>
        </TableRow>
      </TableHeader>
      <TableBody>
        {executions.data.items.map((run) => {
          const meta = STATUS_META[run.status];
          return (
            <TableRow key={run.id}>
              <TableCell>
                <Link href={`/workflows/${run.workflowId}`} className="hover:underline">
                  {run.workflow.name}
                </Link>
              </TableCell>
              <TableCell>
                <Badge variant="outline" className={`gap-1.5 ${meta.className}`}>
                  <meta.icon className="size-3.5" />
                  {meta.label}
                </Badge>
              </TableCell>
              <TableCell className="text-muted-foreground">
                {formatDistanceToNow(run.startedAt, { addSuffix: true })}
              </TableCell>
              <TableCell className="text-muted-foreground">
                {formatRunDuration(run.startedAt, run.completedAt)}
              </TableCell>
            </TableRow>
          );
        })}
      </TableBody>
    </Table>
  );
};
```

- [ ] **Step 4: Wire up the page**

Replace the full contents of `src/app/(dashboard)/(others)/executions/page.tsx`:

```tsx
import { Suspense } from "react";
import { ErrorBoundary } from "react-error-boundary";
import type { SearchParams } from "nuqs";
import { requireAuth } from "@/lib/auth-utils";
import { HydrateClient } from "@/trpc/server";
import {
  ExecutionsContainer,
  ExecutionsError,
  ExecutionsList,
  ExecutionsLoading,
} from "@/features/executions/components/executions-list";
import { prefetchExecutions } from "@/features/executions/server/prefetch";
import { executionParamsLoader } from "@/features/executions/server/params-loader";

type Props = {
  searchParams: Promise<SearchParams>;
};

export default async function ExecutionsPage({ searchParams }: Props) {
  await requireAuth();
  const params = await executionParamsLoader(searchParams);
  prefetchExecutions(params);
  return (
    <ExecutionsContainer>
      <HydrateClient>
        <ErrorBoundary fallback={<ExecutionsError />}>
          <Suspense fallback={<ExecutionsLoading />}>
            <ExecutionsList />
          </Suspense>
        </ErrorBoundary>
      </HydrateClient>
    </ExecutionsContainer>
  );
}
```

- [ ] **Step 5: Manual verification**

Run: `bun run dev` (and, in another terminal, `bun run inngest-cli` if it's not already running via `bun run dev:all`), open `/executions` while signed in. Expected: the page loads with the centered `EntityContainer` layout (same as `/workflows`), shows "No runs yet..." if you have no execution history yet, or a table of past runs otherwise. Execute a workflow from the editor and confirm a new row appears after a refresh.

- [ ] **Step 6: Type-check**

Run: `bunx tsc --noEmit`
Expected: no errors.

- [ ] **Step 7: Commit**

```bash
git add src/features/executions/hooks src/features/executions/components "src/app/(dashboard)/(others)/executions/page.tsx"
git commit -m "feat: Executions list page"
```

---

### Task 6: Execution detail sheet

**Files:**
- Create: `src/features/executions/components/execution-detail-sheet.tsx`
- Modify: `src/features/executions/components/executions-list.tsx`

**Interfaces:**
- Consumes: `useSuspenseExecution` from Task 5; `ExecutionsList` from Task 5 (modified here to open the sheet on row click).
- Produces: `ExecutionDetailSheet` component.

- [ ] **Step 1: Create the detail sheet**

```tsx
// src/features/executions/components/execution-detail-sheet.tsx
"use client";
import { Suspense } from "react";
import { ErrorBoundary } from "react-error-boundary";
import { formatDistanceToNow } from "date-fns";
import { CheckCircle2Icon, CircleDashedIcon, XCircleIcon } from "lucide-react";
import type { ComponentType } from "react";
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";
import { Badge } from "@/components/ui/badge";
import { LoadingView, ErrorView } from "@/components/dashboard";
import type { RunStatus } from "@/generated/prisma/enums";
import { useSuspenseExecution } from "../hooks/use-executions";

const STATUS_META: Record<
  RunStatus,
  { label: string; icon: ComponentType<{ className?: string }>; className: string }
> = {
  RUNNING: { label: "Running", icon: CircleDashedIcon, className: "text-muted-foreground" },
  SUCCESS: { label: "Success", icon: CheckCircle2Icon, className: "text-emerald-600 dark:text-emerald-400" },
  ERROR: { label: "Error", icon: XCircleIcon, className: "text-destructive" },
};

function formatRunDuration(startedAt: Date | string, completedAt: Date | string | null): string {
  if (!completedAt) return "—";
  const ms = new Date(completedAt).getTime() - new Date(startedAt).getTime();
  if (ms < 1000) return `${ms}ms`;
  const seconds = ms / 1000;
  if (seconds < 60) return `${seconds.toFixed(1)}s`;
  const minutes = Math.floor(seconds / 60);
  const remainingSeconds = Math.round(seconds % 60);
  return `${minutes}m ${remainingSeconds}s`;
}

interface ExecutionDetailContentProps {
  runId: string;
}

const ExecutionDetailContent = ({ runId }: ExecutionDetailContentProps) => {
  const { data: run } = useSuspenseExecution(runId);
  const meta = STATUS_META[run.status];

  return (
    <div className="flex flex-col gap-6">
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

      {run.error && (
        <div className="rounded-lg border border-destructive/30 bg-destructive/5 p-3 text-sm text-destructive">
          {run.error}
        </div>
      )}

      <div className="flex flex-col gap-3">
        <h3 className="text-sm font-medium">Steps</h3>
        {run.steps.length === 0 && (
          <p className="text-sm text-muted-foreground">No steps recorded for this run.</p>
        )}
        <ol className="flex flex-col gap-3">
          {run.steps.map((runStep) => {
            const stepMeta = STATUS_META[runStep.status];
            return (
              <li key={runStep.id} className="flex flex-col gap-1 rounded-lg border p-3">
                <div className="flex items-center gap-2">
                  <stepMeta.icon className={`size-4 ${stepMeta.className}`} />
                  <span className="text-sm font-medium">{runStep.nodeName}</span>
                  <span className="text-xs text-muted-foreground">{runStep.nodeType}</span>
                  <span className="ml-auto text-xs text-muted-foreground">
                    {formatRunDuration(runStep.startedAt, runStep.completedAt)}
                  </span>
                </div>
                {runStep.error && (
                  <p className="text-xs text-destructive">{runStep.error}</p>
                )}
              </li>
            );
          })}
        </ol>
      </div>
    </div>
  );
};

interface ExecutionDetailSheetProps {
  runId: string | null;
  onOpenChange: (open: boolean) => void;
}

export const ExecutionDetailSheet = ({ runId, onOpenChange }: ExecutionDetailSheetProps) => {
  return (
    <Sheet open={runId !== null} onOpenChange={onOpenChange}>
      <SheetContent className="overflow-y-auto">
        <SheetHeader>
          <SheetTitle>Run details</SheetTitle>
          <SheetDescription>Step-by-step history for this execution.</SheetDescription>
        </SheetHeader>
        <div className="px-4 pb-4">
          {runId && (
            <ErrorBoundary fallback={<ErrorView message="Couldn't load this run" />}>
              <Suspense fallback={<LoadingView message="Loading run..." />}>
                <ExecutionDetailContent runId={runId} />
              </Suspense>
            </ErrorBoundary>
          )}
        </div>
      </SheetContent>
    </Sheet>
  );
};
```

- [ ] **Step 2: Wire row clicks into `ExecutionsList`**

In `src/features/executions/components/executions-list.tsx`:

Add these imports at the top:

```ts
import { useState } from "react";
import { ExecutionDetailSheet } from "./execution-detail-sheet";
```

Change the `ExecutionsList` function to track the selected run and open the sheet:

```tsx
export const ExecutionsList = () => {
  const executions = useSuspenseExecutions();
  const [selectedRunId, setSelectedRunId] = useState<string | null>(null);

  if (executions.data.items.length === 0) {
    return (
      <div className="flex flex-1 items-center justify-center py-16">
        <p className="text-sm text-muted-foreground">
          No runs yet — execute a workflow to see its history here.
        </p>
      </div>
    );
  }

  return (
    <>
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead>Workflow</TableHead>
            <TableHead>Status</TableHead>
            <TableHead>Started</TableHead>
            <TableHead>Duration</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {executions.data.items.map((run) => {
            const meta = STATUS_META[run.status];
            return (
              <TableRow
                key={run.id}
                className="cursor-pointer"
                onClick={() => setSelectedRunId(run.id)}
              >
                <TableCell>
                  <Link
                    href={`/workflows/${run.workflowId}`}
                    className="hover:underline"
                    onClick={(event) => event.stopPropagation()}
                  >
                    {run.workflow.name}
                  </Link>
                </TableCell>
                <TableCell>
                  <Badge variant="outline" className={`gap-1.5 ${meta.className}`}>
                    <meta.icon className="size-3.5" />
                    {meta.label}
                  </Badge>
                </TableCell>
                <TableCell className="text-muted-foreground">
                  {formatDistanceToNow(run.startedAt, { addSuffix: true })}
                </TableCell>
                <TableCell className="text-muted-foreground">
                  {formatRunDuration(run.startedAt, run.completedAt)}
                </TableCell>
              </TableRow>
            );
          })}
        </TableBody>
      </Table>
      <ExecutionDetailSheet
        runId={selectedRunId}
        onOpenChange={(open) => !open && setSelectedRunId(null)}
      />
    </>
  );
};
```

- [ ] **Step 3: Manual verification**

Run: `bun run dev`, open `/executions`, click a row. Expected: a sheet slides in from the right showing the run's status, duration, and its per-node step timeline in order; clicking the workflow name link still navigates to the editor without opening the sheet.

- [ ] **Step 4: Type-check**

Run: `bunx tsc --noEmit`
Expected: no errors.

- [ ] **Step 5: Commit**

```bash
git add src/features/executions/components
git commit -m "feat: execution detail sheet with per-node step timeline"
```

---

### Task 7: Profile hooks

**Files:**
- Create: `src/features/profile/hooks/use-profile.ts`

**Interfaces:**
- Produces: `useUpdateProfile`, `useChangePassword`, `useSessions`, `useRevokeSession` — Task 8's components consume all four.

- [ ] **Step 1: Create the hooks**

```ts
// src/features/profile/hooks/use-profile.ts
"use client";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { authClient } from "@/lib/auth-client";

const SESSIONS_QUERY_KEY = ["auth-sessions"];

/**
 * Hook to update the current user's display name.
 */
export const useUpdateProfile = () => {
  return useMutation({
    mutationFn: async (input: { name: string }) => {
      const { error } = await authClient.updateUser(input);
      if (error) throw new Error(error.message);
    },
    onSuccess: () => {
      toast.success("Profile updated");
    },
    onError: (error) => {
      toast.error(`Failed to update profile: ${error.message}`);
    },
  });
};

/**
 * Hook to change the current user's password.
 */
export const useChangePassword = () => {
  return useMutation({
    mutationFn: async (input: { currentPassword: string; newPassword: string }) => {
      const { error } = await authClient.changePassword(input);
      if (error) throw new Error(error.message);
    },
    onSuccess: () => {
      toast.success("Password changed");
    },
    onError: (error) => {
      toast.error(`Failed to change password: ${error.message}`);
    },
  });
};

/**
 * Hook to list the current user's active sessions.
 */
export const useSessions = () => {
  return useQuery({
    queryKey: SESSIONS_QUERY_KEY,
    queryFn: async () => {
      const { data, error } = await authClient.listSessions();
      if (error) throw new Error(error.message);
      return data;
    },
  });
};

/**
 * Hook to revoke a session other than the current one.
 */
export const useRevokeSession = () => {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (input: { token: string }) => {
      const { error } = await authClient.revokeSession(input);
      if (error) throw new Error(error.message);
    },
    onSuccess: () => {
      toast.success("Session revoked");
      queryClient.invalidateQueries({ queryKey: SESSIONS_QUERY_KEY });
    },
    onError: (error) => {
      toast.error(`Failed to revoke session: ${error.message}`);
    },
  });
};
```

- [ ] **Step 2: Type-check**

Run: `bunx tsc --noEmit`
Expected: no errors. (`authClient.updateUser`/`changePassword`/`listSessions`/`revokeSession` are better-auth's built-in client methods — no plugin needed, same as `signIn`/`signOut` already exported from `src/lib/auth-client.ts`.)

- [ ] **Step 3: Commit**

```bash
git add src/features/profile/hooks
git commit -m "feat: profile hooks (update name, change password, sessions)"
```

---

### Task 8: Profile UI + sidebar link

**Files:**
- Create: `src/features/profile/components/account-form.tsx`
- Create: `src/features/profile/components/password-form.tsx`
- Create: `src/features/profile/components/sessions-list.tsx`
- Create: `src/app/(dashboard)/(others)/profile/page.tsx`
- Modify: `src/components/dashboard/app-sidebar.tsx`

**Interfaces:**
- Consumes: `useUpdateProfile`/`useChangePassword`/`useSessions`/`useRevokeSession` from Task 7.

- [ ] **Step 1: Create the account form**

```tsx
// src/features/profile/components/account-form.tsx
"use client";
import { zodResolver } from "@hookform/resolvers/zod";
import { useForm } from "react-hook-form";
import { z } from "zod";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Form, FormControl, FormField, FormItem, FormLabel, FormMessage } from "@/components/ui/form";
import { Input } from "@/components/ui/input";
import { useSession } from "@/lib/auth-client";
import { useUpdateProfile } from "../hooks/use-profile";

const formSchema = z.object({
  name: z.string().min(1, "Name is required"),
});

export function AccountForm() {
  const { data: session } = useSession();
  const updateProfile = useUpdateProfile();
  const form = useForm<z.infer<typeof formSchema>>({
    resolver: zodResolver(formSchema),
    values: { name: session?.user.name ?? "" },
  });

  const onSubmit = form.handleSubmit((values) => {
    updateProfile.mutate(values);
  });

  return (
    <Card>
      <CardHeader>
        <CardTitle>Account</CardTitle>
        <CardDescription>Your name and email address.</CardDescription>
      </CardHeader>
      <CardContent>
        <Form {...form}>
          <form onSubmit={onSubmit} className="flex flex-col gap-4">
            <FormField
              control={form.control}
              name="name"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Name</FormLabel>
                  <FormControl>
                    <Input {...field} />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />
            <div className="flex flex-col gap-2">
              <span className="text-sm font-medium">Email</span>
              <Input value={session?.user.email ?? ""} disabled />
            </div>
            <Button type="submit" disabled={updateProfile.isPending} className="self-start">
              Save changes
            </Button>
          </form>
        </Form>
      </CardContent>
    </Card>
  );
}
```

- [ ] **Step 2: Create the password form**

```tsx
// src/features/profile/components/password-form.tsx
"use client";
import { zodResolver } from "@hookform/resolvers/zod";
import { useForm } from "react-hook-form";
import { z } from "zod";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Form, FormControl, FormField, FormItem, FormLabel, FormMessage } from "@/components/ui/form";
import { Input } from "@/components/ui/input";
import { useChangePassword } from "../hooks/use-profile";

const formSchema = z
  .object({
    currentPassword: z.string().min(1, "Current password is required"),
    newPassword: z.string().min(8, "Password must be at least 8 characters"),
    confirmPassword: z.string().min(1, "Confirm your new password"),
  })
  .refine((input) => input.newPassword === input.confirmPassword, {
    message: "Passwords don't match",
    path: ["confirmPassword"],
  });

export function PasswordForm() {
  const changePassword = useChangePassword();
  const form = useForm<z.infer<typeof formSchema>>({
    resolver: zodResolver(formSchema),
    defaultValues: { currentPassword: "", newPassword: "", confirmPassword: "" },
  });

  const onSubmit = form.handleSubmit((values) => {
    changePassword.mutate(
      { currentPassword: values.currentPassword, newPassword: values.newPassword },
      { onSuccess: () => form.reset() },
    );
  });

  return (
    <Card>
      <CardHeader>
        <CardTitle>Password</CardTitle>
        <CardDescription>Change the password you use to sign in.</CardDescription>
      </CardHeader>
      <CardContent>
        <Form {...form}>
          <form onSubmit={onSubmit} className="flex flex-col gap-4">
            <FormField
              control={form.control}
              name="currentPassword"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Current password</FormLabel>
                  <FormControl>
                    <Input type="password" {...field} />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />
            <FormField
              control={form.control}
              name="newPassword"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>New password</FormLabel>
                  <FormControl>
                    <Input type="password" {...field} />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />
            <FormField
              control={form.control}
              name="confirmPassword"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Confirm new password</FormLabel>
                  <FormControl>
                    <Input type="password" {...field} />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />
            <Button type="submit" disabled={changePassword.isPending} className="self-start">
              Change password
            </Button>
          </form>
        </Form>
      </CardContent>
    </Card>
  );
}
```

- [ ] **Step 3: Create the sessions list**

```tsx
// src/features/profile/components/sessions-list.tsx
"use client";
import { formatDistanceToNow } from "date-fns";
import { LaptopIcon, LoaderIcon } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { useSession } from "@/lib/auth-client";
import { useRevokeSession, useSessions } from "../hooks/use-profile";

export function SessionsList() {
  const { data: currentSession } = useSession();
  const { data: sessions, isLoading } = useSessions();
  const revokeSession = useRevokeSession();

  return (
    <Card>
      <CardHeader>
        <CardTitle>Active sessions</CardTitle>
        <CardDescription>Devices currently signed in to your account.</CardDescription>
      </CardHeader>
      <CardContent className="flex flex-col gap-3">
        {isLoading && <LoaderIcon className="size-4 animate-spin text-muted-foreground" />}
        {sessions?.map((session) => {
          const isCurrent = session.id === currentSession?.session.id;
          return (
            <div
              key={session.id}
              className="flex items-center justify-between gap-4 rounded-lg border p-3"
            >
              <div className="flex items-center gap-3">
                <LaptopIcon className="size-4 text-muted-foreground" />
                <div>
                  <p className="text-sm font-medium">{session.userAgent ?? "Unknown device"}</p>
                  <p className="text-xs text-muted-foreground">
                    Signed in {formatDistanceToNow(session.createdAt, { addSuffix: true })}
                  </p>
                </div>
              </div>
              {isCurrent ? (
                <Badge variant="secondary">This device</Badge>
              ) : (
                <Button
                  variant="outline"
                  size="sm"
                  disabled={revokeSession.isPending}
                  onClick={() => revokeSession.mutate({ token: session.token })}
                >
                  Revoke
                </Button>
              )}
            </div>
          );
        })}
        {!isLoading && sessions?.length === 0 && (
          <p className="text-sm text-muted-foreground">No active sessions.</p>
        )}
      </CardContent>
    </Card>
  );
}
```

- [ ] **Step 4: Create the profile page**

```tsx
// src/app/(dashboard)/(others)/profile/page.tsx
import { requireAuth } from "@/lib/auth-utils";
import { AccountForm } from "@/features/profile/components/account-form";
import { PasswordForm } from "@/features/profile/components/password-form";
import { SessionsList } from "@/features/profile/components/sessions-list";

export default async function ProfilePage() {
  await requireAuth();
  return (
    <div className="p-4 md:px-10 md:py-6 h-full">
      <div className="mx-auto max-w-3xl w-full flex flex-col gap-y-8">
        <div className="flex flex-col">
          <h1 className="text-lg md:text-xl font-semibold">Profile</h1>
          <p className="text-xs md:text-sm text-muted-foreground">
            Manage your account and security settings.
          </p>
        </div>
        <AccountForm />
        <PasswordForm />
        <SessionsList />
      </div>
    </div>
  );
}
```

- [ ] **Step 5: Add "Profile" to the sidebar**

In `src/components/dashboard/app-sidebar.tsx`, add `UserIcon` to the existing lucide-react import list (it currently starts `import { CreditCardIcon, FolderOpenIcon, ... } from "lucide-react";` — add `UserIcon` alphabetically alongside the others).

Then, in the `SidebarFooter`'s `SidebarMenu`, add a new `SidebarMenuItem` for Profile immediately before the existing "Billing Portal" `SidebarMenuItem`:

```tsx
          <SidebarMenuItem>
            <SidebarMenuButton
              tooltip="Profile"
              isActive={pathname === "/profile"}
              asChild
              className="gap-x-4 h-10 px-4"
            >
              <Link href="/profile" prefetch>
                <UserIcon className="h-4 w-4" />
                <span>Profile</span>
              </Link>
            </SidebarMenuButton>
          </SidebarMenuItem>
```

- [ ] **Step 6: Manual verification**

Run: `bun run dev`, open `/profile`. Expected: the sidebar shows a "Profile" entry above "Billing Portal" that highlights when active; the page shows your current name pre-filled (editable), your email (read-only), a password-change form, and a list with at least the current session marked "This device".

- [ ] **Step 7: Type-check**

Run: `bunx tsc --noEmit`
Expected: no errors.

- [ ] **Step 8: Commit**

```bash
git add src/features/profile "src/app/(dashboard)/(others)/profile" src/components/dashboard/app-sidebar.tsx
git commit -m "feat: Profile page (account, password, sessions) + sidebar entry"
```

---

### Task 9: Billing UI + sidebar fix

**Files:**
- Create: `src/features/billing/components/subscription-card.tsx`
- Create: `src/app/(dashboard)/(others)/billing/page.tsx`
- Modify: `src/components/dashboard/app-sidebar.tsx`

**Interfaces:**
- Consumes: `useHasActiveSubscription` from `@/components/subscriptions/hooks` (already exists, unchanged); `checkout`, `authClient` from `@/lib/auth-client` (already exists, unchanged).

- [ ] **Step 1: Create the subscription card**

```tsx
// src/features/billing/components/subscription-card.tsx
"use client";
import { CheckCircle2Icon } from "lucide-react";
import { toast } from "sonner";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { useHasActiveSubscription } from "@/components/subscriptions/hooks";
import { authClient, checkout } from "@/lib/auth-client";

export function SubscriptionCard() {
  const { hasActiveSubscription, subscription, isLoading } = useHasActiveSubscription();

  const handleUpgrade = () => {
    checkout({ slug: "pro" });
  };

  const handleManageBilling = async () => {
    const { data, error } = await authClient.customer.portal();
    if (error) {
      toast.error(`Couldn't open the billing portal: ${error.message}`);
      return;
    }
    if (data?.url) {
      window.location.href = data.url;
    }
  };

  if (isLoading) {
    return (
      <Card className="animate-pulse">
        <CardHeader>
          <div className="h-5 w-32 rounded bg-muted" />
        </CardHeader>
        <CardContent>
          <div className="h-8 w-full rounded bg-muted" />
        </CardContent>
      </Card>
    );
  }

  const periodEnd = subscription?.currentPeriodEnd
    ? new Date(subscription.currentPeriodEnd).toLocaleDateString()
    : null;

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          {hasActiveSubscription ? "Pro" : "Free"}
          {hasActiveSubscription && <Badge variant="secondary">Active</Badge>}
        </CardTitle>
        <CardDescription>
          {hasActiveSubscription
            ? periodEnd
              ? subscription?.cancelAtPeriodEnd
                ? `Cancels on ${periodEnd}`
                : `Renews on ${periodEnd}`
              : "You're on the Pro plan."
            : "You're on the free plan."}
        </CardDescription>
      </CardHeader>
      <CardContent className="flex flex-wrap gap-3">
        {!hasActiveSubscription && (
          <Button onClick={handleUpgrade}>
            <CheckCircle2Icon className="size-4" />
            Upgrade to Pro
          </Button>
        )}
        <Button variant="outline" onClick={handleManageBilling}>
          Manage billing
        </Button>
      </CardContent>
    </Card>
  );
}
```

- [ ] **Step 2: Create the billing page**

```tsx
// src/app/(dashboard)/(others)/billing/page.tsx
import { requireAuth } from "@/lib/auth-utils";
import { SubscriptionCard } from "@/features/billing/components/subscription-card";

export default async function BillingPage() {
  await requireAuth();
  return (
    <div className="p-4 md:px-10 md:py-6 h-full">
      <div className="mx-auto max-w-3xl w-full flex flex-col gap-y-8">
        <div className="flex flex-col">
          <h1 className="text-lg md:text-xl font-semibold">Billing</h1>
          <p className="text-xs md:text-sm text-muted-foreground">
            Manage your plan and billing details.
          </p>
        </div>
        <SubscriptionCard />
      </div>
    </div>
  );
}
```

- [ ] **Step 3: Fix the dead sidebar button**

In `src/components/dashboard/app-sidebar.tsx`, find the "Billing Portal" `SidebarMenuItem` in `SidebarFooter` (its `SidebarMenuButton` currently has `onClick={() => {}}` and no `asChild`/`Link`). Replace it with a real link, matching the shape every other sidebar item already uses:

```tsx
          <SidebarMenuItem>
            <SidebarMenuButton
              tooltip="Billing"
              isActive={pathname === "/billing"}
              asChild
              className="gap-x-4 h-10 px-4"
            >
              <Link href="/billing" prefetch>
                <CreditCardIcon className="h-4 w-4" />
                <span>Billing</span>
              </Link>
            </SidebarMenuButton>
          </SidebarMenuItem>
```

(`CreditCardIcon` and `Link` are already imported in this file — no import changes needed for this step.)

- [ ] **Step 4: Manual verification**

Run: `bun run dev`, open `/billing` on a free account. Expected: "Free" plan card with an "Upgrade to Pro" button (opens Polar checkout) and a "Manage billing" button (redirects to Polar's hosted customer portal). Clicking "Billing" in the sidebar navigates to `/billing` and highlights the sidebar entry.

- [ ] **Step 5: Type-check**

Run: `bunx tsc --noEmit`
Expected: no errors.

- [ ] **Step 6: Commit**

```bash
git add src/features/billing "src/app/(dashboard)/(others)/billing" src/components/dashboard/app-sidebar.tsx
git commit -m "feat: Billing page + fix dead sidebar Billing Portal button"
```

---

### Task 10: Landing page hero + workflow animation

**Files:**
- Create: `src/features/marketing/components/workflow-animation.tsx`
- Create: `src/features/marketing/components/hero.tsx`

**Interfaces:**
- Consumes: `NodeIcon` from `src/features/workflows/nodes/node-icon.tsx` (unchanged).
- Produces: `Hero` component — Task 11's `page.tsx` renders it.

- [ ] **Step 1: Create the workflow animation**

```tsx
// src/features/marketing/components/workflow-animation.tsx
import { GlobeIcon, MousePointerIcon } from "lucide-react";
import { NodeIcon } from "@/features/workflows/nodes/node-icon";

const STEPS = [
  { label: "Trigger", icon: MousePointerIcon, delay: "0s" },
  { label: "HTTP Request", icon: GlobeIcon, delay: "2s" },
  { label: "Gemini", icon: "/gemini.svg", delay: "4s" },
] as const;

const LINE_DELAYS = ["0.5s", "2.5s"] as const;

/**
 * A looping diagram of a workflow executing: the exact icons the real
 * node-selector/canvas use for Trigger, HTTP Request, and an AI provider
 * node, connected by animated lines a pulse travels along in sequence —
 * echoing the same loading/success visual language the editor already
 * uses for live execution (workflowRunChannel's status topic), just
 * looping for show instead of reporting a real run.
 *
 * Pure CSS/SVG, no client JS, no animation library. Every animated
 * element shares one 6s duration + infinite iteration; each element's
 * own animation-delay is what staggers it within that shared cycle, so
 * the whole diagram stays in sync loop after loop:
 *   t=0.0s  node 0 (Trigger) glows
 *   t=0.5s  line 0->1 pulse travels (~1.3s)
 *   t=2.0s  node 1 (HTTP Request) glows
 *   t=2.5s  line 1->2 pulse travels (~1.3s)
 *   t=4.0s  node 2 (Gemini) glows
 *   t=4.4s..6.0s  pause, then the 6s cycle repeats
 */
export function WorkflowAnimation() {
  return (
    <div className="w-full max-w-xl">
      <style>{`
        @keyframes relay-node-glow {
          0%, 8%, 100% { box-shadow: 0 0 0 0 transparent; border-color: var(--color-border); }
          4% { box-shadow: 0 0 0 6px color-mix(in oklab, var(--color-primary) 25%, transparent); border-color: var(--color-primary); }
        }
        @keyframes relay-line-flow {
          0%, 100% { stroke-dashoffset: 40; opacity: 0; }
          2% { opacity: 1; }
          22% { stroke-dashoffset: -40; opacity: 1; }
          24% { opacity: 0; }
        }
        .relay-node { animation: relay-node-glow 6s ease-in-out infinite; }
        .relay-line { animation: relay-line-flow 6s ease-in-out infinite; }
        @media (prefers-reduced-motion: reduce) {
          .relay-node, .relay-line { animation: none; }
        }
      `}</style>
      <div className="flex items-center">
        {STEPS.map((stepItem, index) => (
          <div key={stepItem.label} className="flex flex-1 items-center last:flex-none">
            <div
              className="relay-node flex shrink-0 flex-col items-center gap-2 rounded-2xl border-2 bg-card p-4"
              style={{ animationDelay: stepItem.delay }}
            >
              <NodeIcon icon={stepItem.icon} label={stepItem.label} imageSize={24} />
              <span className="whitespace-nowrap text-xs font-medium text-muted-foreground">
                {stepItem.label}
              </span>
            </div>
            {index < STEPS.length - 1 && (
              <svg
                className="mx-1 hidden flex-1 sm:block"
                viewBox="0 0 100 4"
                preserveAspectRatio="none"
                style={{ height: 4, minWidth: 40 }}
              >
                <line x1="0" y1="2" x2="100" y2="2" stroke="var(--color-border)" strokeWidth="2" />
                <line
                  className="relay-line"
                  x1="0"
                  y1="2"
                  x2="100"
                  y2="2"
                  stroke="var(--color-primary)"
                  strokeWidth="2"
                  strokeDasharray="40 60"
                  style={{ animationDelay: LINE_DELAYS[index] }}
                />
              </svg>
            )}
          </div>
        ))}
      </div>
    </div>
  );
}
```

- [ ] **Step 2: Create the hero**

```tsx
// src/features/marketing/components/hero.tsx
import Link from "next/link";
import { Button } from "@/components/ui/button";
import { WorkflowAnimation } from "./workflow-animation";

export function Hero() {
  return (
    <section className="relative overflow-hidden px-6 pt-24 pb-20 sm:pt-32 sm:pb-28">
      <div className="mx-auto flex max-w-6xl flex-col items-center gap-12 text-center">
        <div className="flex flex-col items-center gap-6">
          <span className="rounded-full border bg-card px-4 py-1.5 text-xs font-medium text-muted-foreground">
            Visual workflow automation
          </span>
          <h1 className="max-w-3xl text-balance font-poppins text-4xl font-semibold tracking-tight sm:text-6xl">
            Automate anything. <span className="text-primary">Watch it run.</span>
          </h1>
          <p className="max-w-xl text-balance text-lg text-muted-foreground">
            Relay is a visual canvas for building automations that call APIs, run AI
            models, and react to triggers — wired together node by node, executed step
            by step, in real time.
          </p>
        </div>
        <div className="flex flex-wrap items-center justify-center gap-4">
          <Button size="lg" asChild>
            <Link href="/signup">Start building — it&apos;s free</Link>
          </Button>
          <Button size="lg" variant="outline" asChild>
            <Link href="/login">Sign in</Link>
          </Button>
        </div>
        <div className="w-full rounded-3xl border bg-muted/30 p-8 sm:p-12">
          <WorkflowAnimation />
        </div>
      </div>
    </section>
  );
}
```

- [ ] **Step 3: Manual visual check**

Since this is presentational/animated work with no automated test coverage (matches the spec's Testing section), verify by eye: run `bun run dev`, temporarily render `<Hero />` on any page (or wait for Task 11 to wire it into `/`), and confirm in the browser that the three nodes glow in left-to-right sequence with the connecting lines pulsing between them, looping smoothly with no layout jump. Toggle "Emulate CSS prefers-reduced-motion: reduce" in devtools and confirm the animation freezes to a static diagram.

- [ ] **Step 4: Type-check**

Run: `bunx tsc --noEmit`
Expected: no errors.

- [ ] **Step 5: Commit**

```bash
git add src/features/marketing/components/workflow-animation.tsx src/features/marketing/components/hero.tsx
git commit -m "feat: landing page hero with animated workflow-execution diagram"
```

---

### Task 11: Landing page composition, footer, and auth redirect

**Files:**
- Create: `src/features/marketing/components/features.tsx`
- Create: `src/features/marketing/components/site-footer.tsx`
- Modify: `src/app/page.tsx`
- Modify: `src/lib/auth-utils.ts`

**Interfaces:**
- Consumes: `Hero` from Task 10; `requireUnAuth` from `src/lib/auth-utils.ts`.

- [ ] **Step 1: Create the features section**

```tsx
// src/features/marketing/components/features.tsx
import { BotIcon, GlobeIcon, KeyIcon, WorkflowIcon } from "lucide-react";
import type { ComponentType } from "react";

const FEATURES: { icon: ComponentType<{ className?: string }>; title: string; description: string }[] = [
  {
    icon: WorkflowIcon,
    title: "Visual canvas",
    description:
      "Drag nodes onto a canvas and connect them into a flow — triggers, branches, and actions, all visible at a glance.",
  },
  {
    icon: BotIcon,
    title: "AI-native nodes",
    description:
      "OpenAI, Anthropic, Gemini, Groq, DeepSeek, Mistral, Moonshot, or a local Ollama model — call any of them from a single node, with an AI agent that can use your other nodes as tools.",
  },
  {
    icon: GlobeIcon,
    title: "Real integrations",
    description:
      "HTTP requests, conditional branching, and multi-way routing — the building blocks for automations that actually do something.",
  },
  {
    icon: KeyIcon,
    title: "Your credentials, encrypted",
    description:
      "API keys and connected accounts are encrypted at rest and scoped to you — every workflow node only ever reads what it's authorized to.",
  },
];

export function Features() {
  return (
    <section className="border-t bg-card/30 px-6 py-20">
      <div className="mx-auto max-w-6xl">
        <div className="mx-auto max-w-2xl text-center">
          <h2 className="font-poppins text-3xl font-semibold tracking-tight sm:text-4xl">
            Everything a workflow needs
          </h2>
          <p className="mt-3 text-muted-foreground">
            Relay isn&apos;t a diagram of your automation — it&apos;s the automation.
          </p>
        </div>
        <div className="mt-12 grid gap-6 sm:grid-cols-2">
          {FEATURES.map((feature) => (
            <div key={feature.title} className="rounded-2xl border bg-card p-6">
              <div className="mb-4 flex size-10 items-center justify-center rounded-[8px] bg-primary/10">
                <feature.icon className="size-5 text-primary" />
              </div>
              <h3 className="font-medium">{feature.title}</h3>
              <p className="mt-1.5 text-sm text-muted-foreground">{feature.description}</p>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}
```

- [ ] **Step 2: Create the footer**

```tsx
// src/features/marketing/components/site-footer.tsx
import Image from "next/image";
import Link from "next/link";

export function SiteFooter() {
  return (
    <footer className="border-t px-6 py-10">
      <div className="mx-auto flex max-w-6xl flex-col items-center justify-between gap-4 sm:flex-row">
        <div className="flex items-center gap-2 text-sm text-muted-foreground">
          <Image src="/logo.svg" alt="" width={18} height={18} className="opacity-70" />
          <span>
            Developed by{" "}
            <a
              href="https://github.com/yash27007"
              target="_blank"
              rel="noreferrer"
              className="font-medium text-foreground underline-offset-4 hover:underline"
            >
              Yashwanth Aravind
            </a>
          </span>
        </div>
        <div className="flex items-center gap-4 text-sm">
          <a
            href="https://github.com/yash27007"
            target="_blank"
            rel="noreferrer"
            className="flex items-center gap-1.5 text-muted-foreground hover:text-foreground"
          >
            <Image src="/github.svg" alt="" width={16} height={16} className="opacity-70 dark:invert" />
            GitHub
          </a>
          <Link href="/login" className="text-muted-foreground hover:text-foreground">
            Sign in
          </Link>
          <Link href="/signup" className="text-muted-foreground hover:text-foreground">
            Sign up
          </Link>
        </div>
      </div>
    </footer>
  );
}
```

- [ ] **Step 3: Update the redirect target in `requireUnAuth`**

In `src/lib/auth-utils.ts`, change the one `redirect(...)` call inside `requireUnAuth`:

```ts
export const requireUnAuth = async () => {
  const session = await auth.api.getSession({
    headers: await headers(),
  });

  if (session) {
    redirect("/workflows");
  }

  return session;
};
```

(Only the redirect target changes, from `"/"` to `"/workflows"` — `requireAuth` above it is untouched.)

- [ ] **Step 4: Rewrite the landing page**

Replace the full contents of `src/app/page.tsx`:

```tsx
import { requireUnAuth } from "@/lib/auth-utils";
import { Features } from "@/features/marketing/components/features";
import { Hero } from "@/features/marketing/components/hero";
import { SiteFooter } from "@/features/marketing/components/site-footer";

export default async function LandingPage() {
  await requireUnAuth();
  return (
    <div className="flex min-h-screen flex-col">
      <Hero />
      <Features />
      <SiteFooter />
    </div>
  );
}
```

- [ ] **Step 5: Manual verification**

Run: `bun run dev`.
- Signed out: open `/`. Expected: the marketing page renders — hero with the animated diagram, feature cards, footer with "Developed by Yashwanth Aravind" linking to `https://github.com/yash27007` and a GitHub link, plus Sign in/Sign up links.
- Signed in: open `/`. Expected: immediate redirect to `/workflows` (no flash of the marketing page).
- Signed in, open `/login` or `/signup` directly. Expected: redirect to `/workflows` (not back to `/`), confirming the `requireUnAuth` target change took effect everywhere it's used.

- [ ] **Step 6: Type-check**

Run: `bunx tsc --noEmit`
Expected: no errors.

- [ ] **Step 7: Run the full test suite**

Run: `bun test`
Expected: PASS, every test in the repo (including the new `run-workflow.test.ts` cases from Task 2).

- [ ] **Step 8: Commit**

```bash
git add src/features/marketing/components/features.tsx src/features/marketing/components/site-footer.tsx src/app/page.tsx src/lib/auth-utils.ts
git commit -m "feat: landing page composition, footer, and post-auth redirect to /workflows"
```
