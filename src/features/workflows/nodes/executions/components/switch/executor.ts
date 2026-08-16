import { NonRetriableError } from "inngest";
import { NodeExecutor } from "../../../executions/types";
import { resolveTemplate } from "../../lib/resolve-template";

export interface SwitchCase {
  id: string;
  value: string;
}

type SwitchData = {
  value?: string;
  cases?: SwitchCase[];
};

export const SwitchExecutor: NodeExecutor<SwitchData> = async ({
  nodeId,
  context,
  data,
  step,
}) => {
  if (!data.value) {
    throw new NonRetriableError("Switch node: value is required");
  }

  const resolvedValue = resolveTemplate(data.value, context);
  if (resolvedValue === undefined) {
    throw new NonRetriableError("Switch node: value could not be resolved");
  }

  const cases = data.cases ?? [];

  const branch = await step.run(`switch-${nodeId}`, async () => {
    for (const switchCase of cases) {
      const resolvedCaseValue = resolveTemplate(switchCase.value, context);
      if (String(resolvedValue) === String(resolvedCaseValue)) {
        return switchCase.id;
      }
    }
    return "default";
  });

  return { context, branch };
};
