import type { Connection, Node } from "@/generated/prisma/client";
import type { NodeType } from "@/generated/prisma/enums";
import type { GetStepTools, Inngest } from "inngest";

export type WorkflowContext = Record<string, unknown>;

export type StepTools = GetStepTools<Inngest.Any>;

export interface NodeExecutorParams<TData = Record<string, unknown>> {
  data: TData;
  nodeId: string;
  context: WorkflowContext;
  step: StepTools;
  /**
   * The workflow owner's id. Sourced by runWorkflow from the trusted,
   * DB-loaded Workflow.userId column — never from node/workflow data,
   * template-resolved context, or anything else workflow-author-controlled.
   * Executors that look up a user's saved credential (e.g. an AI provider
   * API key) must scope that lookup by this id.
   */
  userId: string;
  /**
   * The full executor registry lookup, threaded down uniformly like
   * `step`/`userId` — only the Agent executor uses this, to invoke a
   * connected tool node's real executor. Every other executor receives it
   * but has no reason to call it.
   */
  getExecutor: (type: NodeType) => NodeExecutor;
  /**
   * The workflow's complete node/connection lists — same rationale as
   * `getExecutor`. The Agent executor filters `allConnections` for
   * connections into its own tool-target handle to discover which of
   * `allNodes` are wired to it as tools.
   */
  allNodes: Node[];
  allConnections: Connection[];
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
