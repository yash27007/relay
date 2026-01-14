"use client";
import { useTRPC } from "@/trpc/client";
import { useMutation, useQueryClient, useSuspenseQuery } from "@tanstack/react-query";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
/**
 * Hook to fetch all workflows using suspense
 */

export const useSuspenseWorkflows = () => {
  const trpc = useTRPC();
  return useSuspenseQuery(trpc.workflows.getAllWorkflows.queryOptions());
};

/**
 * Hook to create a workflow
 */

export const useCreateWorkflow = ()=>{
  const trpc = useTRPC()
  const queryClient = useQueryClient()

  return useMutation(
    trpc.workflows.create.mutationOptions({
      onSuccess: (data)=>{
        toast.success(`Workflow ${data.name} created!`)
        queryClient.invalidateQueries(
          trpc.workflows.getAllWorkflows.queryOptions()
        );
      },
      onError: (error) =>{
        toast.error(`Failed to create workflow: ${error.message}`)
      }
    })
  );
}