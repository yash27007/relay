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
