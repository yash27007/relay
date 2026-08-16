import { NonRetriableError } from "inngest";
import { inngest } from "./client";
import { prisma } from "@/lib/db";
import { runWorkflow } from "./run-workflow";
import { getExecutor } from "@/features/workflows/nodes/executions/lib/executor-registry";
import type { Connection, Node } from "@/generated/prisma/client";

export const executeWorkflow = inngest.createFunction(
  { id: "execute-workflow" },
  { event: "workflows/execute.workflow" },
  async ({ event, step }) => {
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
    });

    return {
      workflowID,
      result,
    };
  },
);
