import { requireAuth } from "@/lib/auth-utils";
import { HydrateClient } from "@/trpc/server";
import { prefetchWorkflows } from "@/workflows/server/prefetch";
import { Suspense } from "react";
import { ErrorBoundary } from "react-error-boundary";
import { WorkflowsContainer, WorkflowsList } from "@/workflows/components/workflow";

export default async function WorkflowPage() {
  requireAuth();
  await prefetchWorkflows()
  return (
    <WorkflowsContainer>
      <HydrateClient>
        <ErrorBoundary fallback={<p>Error!</p>}>
          <Suspense fallback={<p>Loading...</p>}>
            <WorkflowsList />
          </Suspense>
        </ErrorBoundary>
      </HydrateClient>
    </WorkflowsContainer>
  );
}
