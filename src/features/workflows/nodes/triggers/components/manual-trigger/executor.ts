import { NodeExecutor } from "../../../executions/types";
type ManualTriggerData = Record<string, unknown>;
export const manualTriggerExecutor: NodeExecutor<ManualTriggerData> = async ({
  nodeId,
  context,
  step,
}) => {
  const result = await step.run("manual-trigger", async () => context);

  return { context: result };
};
