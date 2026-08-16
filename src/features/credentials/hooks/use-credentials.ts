"use client";
import { useSuspenseQuery } from "@tanstack/react-query";
import { useTRPC } from "@/trpc/client";

/**
 * Hook to fetch the current user's credential/connection status for every
 * supported provider, using suspense.
 */
export const useSuspenseCredentials = () => {
  const trpc = useTRPC();
  return useSuspenseQuery(trpc.credentials.list.queryOptions());
};
