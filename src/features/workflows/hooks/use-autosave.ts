"use client";

import { useEffect, useRef, useCallback, useState } from "react";
import type { Node, Edge } from "@xyflow/react";
import { useUpdateWorkflow } from "./use-workflows";
import { useAtomValue, useSetAtom } from "jotai";
import {
  autosaveEnabledAtom,
  autosaveStatusAtom,
} from "@/features/workflows/editor/store/atoms";

interface UseAutosaveOptions {
  workflowId: string;
  nodes: Node[];
  edges: Edge[];
  /** Delay in milliseconds before saving (default: 1000ms) */
  delay?: number;
}

/**
 * Hook that automatically saves workflow changes after a debounce delay
 */
export const useAutosave = ({
  workflowId,
  nodes,
  edges,
  delay = 1000,
}: UseAutosaveOptions) => {
  const enabled = useAtomValue(autosaveEnabledAtom);
  const setAutosaveStatus = useSetAtom(autosaveStatusAtom);
  const { mutate: updateWorkflow, isPending: isSaving } = useUpdateWorkflow();
  const timeoutRef = useRef<NodeJS.Timeout | null>(null);
  const [lastSaved, setLastSaved] = useState<Date | null>(null);
  const isInitialMount = useRef(true);

  // Update atom when saving status changes
  useEffect(() => {
    setAutosaveStatus({ isSaving, lastSaved });
  }, [isSaving, lastSaved, setAutosaveStatus]);

  // Store previous values to detect actual changes
  const prevNodesRef = useRef<string>(JSON.stringify(nodes));
  const prevEdgesRef = useRef<string>(JSON.stringify(edges));

  const save = useCallback(() => {
    updateWorkflow(
      {
        id: workflowId,
        nodes: nodes.map((node) => ({
          id: node.id,
          type: node.type,
          position: node.position,
          data: node.data,
        })),
        edges: edges.map((edge) => ({
          id: edge.id,
          source: edge.source,
          target: edge.target,
          sourceHandle: edge.sourceHandle,
          targetHandle: edge.targetHandle,
        })),
      },
      {
        onSuccess: () => {
          setLastSaved(new Date());
        },
      },
    );
  }, [workflowId, nodes, edges, updateWorkflow]);

  useEffect(() => {
    // Skip autosave on initial mount
    if (isInitialMount.current) {
      isInitialMount.current = false;
      return;
    }

    if (!enabled) return;

    const currentNodes = JSON.stringify(nodes);
    const currentEdges = JSON.stringify(edges);

    // Only save if there are actual changes
    const hasChanges =
      currentNodes !== prevNodesRef.current ||
      currentEdges !== prevEdgesRef.current;

    if (!hasChanges) return;

    // Update refs
    prevNodesRef.current = currentNodes;
    prevEdgesRef.current = currentEdges;

    // Clear any existing timeout
    if (timeoutRef.current) {
      clearTimeout(timeoutRef.current);
    }

    // Set new timeout for debounced save
    timeoutRef.current = setTimeout(() => {
      save();
    }, delay);

    // Cleanup on unmount or when dependencies change
    return () => {
      if (timeoutRef.current) {
        clearTimeout(timeoutRef.current);
      }
    };
  }, [nodes, edges, delay, enabled, save]);

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      if (timeoutRef.current) {
        clearTimeout(timeoutRef.current);
      }
    };
  }, []);

  return {
    isSaving,
    lastSaved,
    saveNow: save,
  };
};
