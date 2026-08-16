"use client";
import { useMutation, useQueryClient, useSuspenseQuery } from "@tanstack/react-query";
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
 */
export const useApiKeysByType = (type: AIProviderType) => {
  const trpc = useTRPC();
  return useSuspenseQuery(trpc.credentials.apiKeys.listByType.queryOptions({ type }));
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
