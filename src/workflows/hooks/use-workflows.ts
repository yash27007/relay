"use client";
import {
  useMutation,
  useQueryClient,
  useSuspenseQuery,
} from "@tanstack/react-query";
import { toast } from "sonner";
import { useTRPC } from "@/trpc/client";
import { useWorkflowParams } from "./use-workflow-params";
/**
 * Hook to fetch all workflows using suspense
 */

export const useSuspenseWorkflows = () => {
  const trpc = useTRPC();
  const [params] = useWorkflowParams();
  return useSuspenseQuery(trpc.workflows.getAllWorkflows.queryOptions(params));
};

/**
 * Hook to create a workflow
 */

export const useCreateWorkflow = () => {
  const trpc = useTRPC();
  const queryClient = useQueryClient();

  return useMutation(
    trpc.workflows.create.mutationOptions({
      onSuccess: (data) => {
        toast.success(`Workflow ${data.name} created!`);
        queryClient.invalidateQueries(
          trpc.workflows.getAllWorkflows.queryOptions({})
        );
      },
      onError: (error) => {
        toast.error(`Failed to create workflow: ${error.message}`);
      },
    })
  );
};

/**
 * Hook to remove a workflow
 */

export const useRemoveWorkflow = () => {
  const trpc = useTRPC();
  const queryClient = useQueryClient();
  return useMutation(
    trpc.workflows.remove.mutationOptions({
      onSuccess: (data) => {
        toast.success(`Workflow ${data.name} removed!!`);
        queryClient.invalidateQueries(
          trpc.workflows.getAllWorkflows.queryOptions({})
        );
        queryClient.invalidateQueries(
          trpc.workflows.getWorkflowbyId.queryFilter({ id: data.id })
        );
      },
    })
  );
};
