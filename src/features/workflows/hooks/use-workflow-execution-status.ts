"use client";
import { useQueryClient } from "@tanstack/react-query";
import { useInngestSubscription } from "@inngest/realtime/hooks";
import { useMemo } from "react";
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
    queryClient.fetchQuery({
      ...trpc.workflows.getRealtimeToken.queryOptions({ id: workflowID }),
      // The query client's default staleTime (30s) would otherwise return the
      // same cached token object on every refreshToken() call within that
      // window. useInngestSubscription bails out of reconnecting whenever
      // setToken(newToken) receives a reference-equal value (React's
      // Object.is check on state), so a cached token silently kills the
      // subscription's ability to recover from a dropped connection for up
      // to 30s. A subscription token is cheap to reissue — always fetch it
      // fresh.
      staleTime: 0,
    });

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
  //
  // useMemo (keyed on the `freshData` array reference, which only changes
  // when a real message arrives — see hooks.mjs's setFreshData([value]))
  // is required, not optional: without it, .map allocates a brand-new array
  // on every render, which never reference-equals the previous render's
  // array. Consumers that depend on this hook's return value in a
  // useEffect dependency array would then re-run that effect on every
  // render forever once the first message arrives (freshData itself is
  // never reset to empty by the underlying hook), spinning the host
  // component in an infinite render loop.
  return useMemo(
    () => (freshData ?? []).map((message) => (message as { data: NodeStatusMessage }).data),
    [freshData],
  );
};
