import { Suspense } from "react";
import { ErrorBoundary } from "react-error-boundary";
import { requireAuth } from "@/lib/auth-utils";
import { HydrateClient } from "@/trpc/server";
import {
  WorkflowsContainer,
  WorkflowsError,
  WorkflowsList,
  WorkflowsLoading,
} from "@/workflows/components/workflow";
import { prefetchWorkflows } from "@/workflows/server/prefetch";
import type { SearchParams } from "nuqs";
import { workflowParamsLoader } from "@/workflows/server/params-loader";
type Props = {
  searchParams: Promise<SearchParams>;
};
export default async function WorkflowPage({ searchParams }: Props) {
  await requireAuth();
  const params = await workflowParamsLoader(searchParams);
  prefetchWorkflows(params);
  return (
    <WorkflowsContainer>
      <HydrateClient>
        <ErrorBoundary fallback={<WorkflowsError />}>
          <Suspense fallback={<WorkflowsLoading />}>
            <WorkflowsList />
          </Suspense>
        </ErrorBoundary>
      </HydrateClient>
    </WorkflowsContainer>
  );
}
