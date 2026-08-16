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
