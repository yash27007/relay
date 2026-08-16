import { Suspense } from "react";
import { ErrorBoundary } from "react-error-boundary";
import { requireAuth } from "@/lib/auth-utils";
import { HydrateClient, prefetch, trpc } from "@/trpc/server";
import {
  CredentialsError,
  CredentialsList,
  CredentialsLoading,
} from "@/features/credentials/components/credentials-list";

export default async function CredentialsPage() {
  await requireAuth();
  prefetch(trpc.credentials.list.queryOptions());

  return (
    <div className="p-6">
      <div className="mb-6">
        <h1 className="text-xl font-semibold">Credentials</h1>
        <p className="text-muted-foreground text-sm">
          Connect the accounts your workflow nodes need to authenticate with.
        </p>
      </div>
      <HydrateClient>
        <ErrorBoundary fallback={<CredentialsError />}>
          <Suspense fallback={<CredentialsLoading />}>
            <CredentialsList />
          </Suspense>
        </ErrorBoundary>
      </HydrateClient>
    </div>
  );
}
