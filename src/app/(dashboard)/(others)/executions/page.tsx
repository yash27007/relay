import { Suspense } from "react";
import { ErrorBoundary } from "react-error-boundary";
import type { SearchParams } from "nuqs";
import { requireAuth } from "@/lib/auth-utils";
import { HydrateClient } from "@/trpc/server";
import {
  ExecutionsContainer,
  ExecutionsError,
  ExecutionsList,
  ExecutionsLoading,
} from "@/features/executions/components/executions-list";
import { prefetchExecutions } from "@/features/executions/server/prefetch";
import { executionParamsLoader } from "@/features/executions/server/params-loader";

type Props = {
  searchParams: Promise<SearchParams>;
};

export default async function ExecutionsPage({ searchParams }: Props) {
  await requireAuth();
  const params = await executionParamsLoader(searchParams);
  prefetchExecutions(params);
  return (
    <ExecutionsContainer>
      <HydrateClient>
        <ErrorBoundary fallback={<ExecutionsError />}>
          <Suspense fallback={<ExecutionsLoading />}>
            <ExecutionsList />
          </Suspense>
        </ErrorBoundary>
      </HydrateClient>
    </ExecutionsContainer>
  );
}
