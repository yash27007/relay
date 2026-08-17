import { NonRetriableError } from "inngest";
import { inngest } from "./client";
import { prisma } from "@/lib/db";
import { runWorkflow } from "./run-workflow";
import { getExecutor } from "@/features/workflows/nodes/executions/lib/executor-registry";
import type { Connection, Node, Prisma } from "@/generated/prisma/client";
import { RunStatus } from "@/generated/prisma/enums";
import type { WorkflowContext } from "@/features/workflows/nodes/executions/types";

// Above this size (in serialized characters — a close enough proxy for
// bytes for this purpose), an input/output snapshot is replaced with a
// small placeholder instead of being written in full. Comfortably above
// any real prompt/HTTP-response payload this app currently produces,
// while still bounding the worst case a pathological response could hit.
const MAX_SNAPSHOT_CHARS = 128_000;

function safeSnapshot(
  value: WorkflowContext | undefined,
): Prisma.InputJsonValue | undefined {
  if (value === undefined) return undefined;
  const serialized = JSON.stringify(value);
  if (serialized.length > MAX_SNAPSHOT_CHARS) {
    return { truncated: true, byteLength: serialized.length };
  }
  // WorkflowContext (Record<string, unknown>) can't be proven JSON-safe
  // structurally — its values are typed `unknown`, not `InputJsonValue`.
  // At runtime it always is: the JSON.stringify above already round-trips
  // it without throwing, so this cast only reconciles the type.
  return value as Prisma.InputJsonValue;
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
      await step
        .run(`record-step-${event.status}-${event.nodeId}`, async () => {
          const input = safeSnapshot(event.input);
          const output = safeSnapshot(event.output);
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
