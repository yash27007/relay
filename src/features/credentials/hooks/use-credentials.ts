"use client";
import { useMutation, useQuery, useQueryClient, useSuspenseQuery } from "@tanstack/react-query";
import { toast } from "sonner";
import { useTRPC } from "@/trpc/client";
import type { AIProviderType } from "../lib/ai-providers";

/**
 * Hook to fetch the current user's credential/connection status for every
 * supported OAuth provider, using suspense.
 */
export const useSuspenseCredentials = () => {
  const trpc = useTRPC();
  return useSuspenseQuery(trpc.credentials.list.queryOptions());
};

/**
 * Hook to fetch the current user's saved API keys, using suspense.
 */
export const useSuspenseApiKeys = () => {
  const trpc = useTRPC();
  return useSuspenseQuery(trpc.credentials.apiKeys.list.queryOptions());
};

/**
 * Hook to fetch the current user's saved API keys for a single provider —
 * used by AI node dialogs to populate their credential picker.
 *
 * Deliberately non-suspense. The editor page does have a Suspense boundary
 * (workflows/[workflowID]/page.tsx), but it wraps the whole editor —
 * canvas, camera position, every other node. A node dialog mounts
 * unconditionally alongside its node, so on a cache miss (e.g. a fresh AI
 * node added to the canvas) useSuspenseQuery here would remount that
 * entire boundary back to its loading fallback rather than just show a
 * loading state inside this one dialog. Callers handle `isLoading` instead.
 */
export const useApiKeysByType = (type: AIProviderType) => {
  const trpc = useTRPC();
  return useQuery(trpc.credentials.apiKeys.listByType.queryOptions({ type }));
};

/**
 * Hook to fetch the available models for a saved credential — used by
 * every AI node dialog's Model combobox. `credentialId` undefined means
 * "no credential chosen yet"; the query stays disabled until one is.
 */
export const useModelsByCredential = (credentialId: string | undefined) => {
  const trpc = useTRPC();
  return useQuery({
    ...trpc.credentials.apiKeys.listModels.queryOptions({ credentialId: credentialId ?? "" }),
    enabled: Boolean(credentialId),
    staleTime: 60 * 60 * 1000,
  });
};

/**
 * Hook to save a new API key.
 */
export const useCreateApiKey = () => {
  const trpc = useTRPC();
  const queryClient = useQueryClient();
  return useMutation(
    trpc.credentials.apiKeys.create.mutationOptions({
      onSuccess: (data) => {
        toast.success(`${data.name} saved`);
        // Invalidates list AND every listByType(...) variant, so a node
        // dialog's credential picker (which queries by type) doesn't go stale.
        queryClient.invalidateQueries(trpc.credentials.apiKeys.pathFilter());
      },
      onError: (error) => {
        toast.error(`Failed to save API key: ${error.message}`);
      },
    }),
  );
};

/**
 * Hook to remove a saved API key.
 */
export const useRemoveApiKey = () => {
  const trpc = useTRPC();
  const queryClient = useQueryClient();
  return useMutation(
    trpc.credentials.apiKeys.remove.mutationOptions({
      onSuccess: () => {
        toast.success("API key removed");
        queryClient.invalidateQueries(trpc.credentials.apiKeys.pathFilter());
      },
      onError: (error) => {
        toast.error(`Failed to remove API key: ${error.message}`);
      },
    }),
  );
};
