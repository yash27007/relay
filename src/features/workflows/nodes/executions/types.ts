import type { GetStepTools, Inngest } from "inngest";

export type WorkflowContext = Record<string, unknown>;

export type StepTools = GetStepTools<Inngest.Any>;

export interface NodeExecutorParams<TData = Record<string, unknown>> {
  data: TData;
  nodeId: string;
  context: WorkflowContext;
  step: StepTools;
  // publish : ADD real time later
}

export interface NodeExecutorResult {
  context: WorkflowContext;
  /**
   * Which output handle this node took, e.g. "true"/"false" for an IF
   * node. Undefined means "propagate to all outgoing connections" — the
   * behavior every non-branching node uses.
   */
  branch?: string;
}

export type NodeExecutor<TData = Record<string, unknown>> = (
  params: NodeExecutorParams<TData>,
) => Promise<NodeExecutorResult>;
