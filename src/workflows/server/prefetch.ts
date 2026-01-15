import type { inferInput } from "@trpc/tanstack-react-query";
import { prefetch, trpc } from "@/trpc/server";

type Input = inferInput<typeof trpc.workflows.getAllWorkflows>;

/**
 * Prefetch all workflows utils ( useful for search )
 */

export const prefetchWorkflows = (params: Input) => {
  return prefetch(trpc.workflows.getAllWorkflows.queryOptions(params));
};

/**
 * Prefetch a single workflow
 *
 */

export const prefetchWorkflow = (id: string) => {
  return prefetch(trpc.workflows.getWorkflowbyId.queryOptions({ id }));
};
