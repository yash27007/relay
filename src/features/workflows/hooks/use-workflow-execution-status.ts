"use client";
import { useQueryClient } from "@tanstack/react-query";
import { useInngestSubscription } from "@inngest/realtime/hooks";
import { useTRPC } from "@/trpc/client";

export type NodeExecutionStatus = "loading" | "success" | "error";

export interface NodeStatusMessage {
  nodeId: string;
  status: NodeExecutionStatus;
}

/**
 * Subscribes to a workflow's live execution status while mounted. Returns
 * only messages that arrived since the last render (freshData) — Editor
 * applies each one to its local node state as it arrives.
 */
export const useWorkflowExecutionStatus = (workflowID: string): NodeStatusMessage[] => {
  const trpc = useTRPC();
  const queryClient = useQueryClient();

  const fetchToken = () =>
    queryClient.fetchQuery(trpc.workflows.getRealtimeToken.queryOptions({ id: workflowID }));

  const { freshData } = useInngestSubscription({
    // No `token` is passed: `useInngestSubscription` seeds its internal token
    // state via `useState(tokenInput)`, so a *function* there (rather than a
    // resolved token) would be taken as a lazy initializer and land the
    // unresolved Promise itself in state — truthy, which skips the hook's
    // mount-time "no token yet, call refreshToken" path and wastes a failed
    // subscribe attempt. Omitting `token` lets that path fire immediately and
    // fetch a real token via `refreshToken` on mount.
    refreshToken: fetchToken,
    enabled: true,
  });

  // `freshData` entries are the raw @inngest/realtime message envelope
  // (`{channel, topic, data, ...}`), not the flat `{nodeId, status}` payload
  // the "status" topic's schema defines — the envelope wraps the published
  // payload under `.data`. Unwrap it here so this hook's return type matches
  // what it actually promises.
  return (freshData ?? []).map((message) => (message as { data: NodeStatusMessage }).data);
};
