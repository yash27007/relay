import { channel, topic } from "@inngest/realtime";
import { z } from "zod";

/**
 * One channel per workflow, carrying per-node execution status as a
 * workflow runs. Subscribed to by the editor while it's open; published to
 * by runWorkflow's execution loop (see run-workflow.ts) — no executor
 * publishes to this directly.
 */
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
