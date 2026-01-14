"use client";

import { Button } from "@/components/ui/button";
import { signOut } from "@/lib/auth-client";
import { useTRPC } from "@/trpc/client";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { redirect } from "next/navigation";
import { toast } from "sonner";

export default function Page() {
  const trpc = useTRPC();
  // const queryClient = useQueryClient()
  const { data } = useQuery(trpc.getWorkflows.queryOptions());
  const create = useMutation(
    trpc.createWorkflow.mutationOptions({
      onSuccess: () => {
        toast.success("Workflow created");
      },
    }),
  );
  const execute = useMutation(
    trpc.executeAi.mutationOptions({
      onSuccess: () => {
        toast.success("Ai Job Queued");
      },
    }),
  );
  return (
    <div className="min-h-screen min-w-screen flex items-center justify-center">
      <div className="flex flex-col gap-3 items-center">
        {JSON.stringify(data)}
        <Button
          onClick={() => {
            execute.mutate();
          }}
        >
          Test Ai
        </Button>
        <Button
          onClick={async () => {
            create.mutate();
          }}
        >
          Create Workflow
        </Button>
        <Button
          onClick={() => {
            signOut({
              fetchOptions: {
                onSuccess: () => {
                  redirect("/login");
                },
              },
            });
          }}
        >
          Logout
        </Button>
      </div>
    </div>
  );
}
