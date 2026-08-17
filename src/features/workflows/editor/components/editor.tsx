"use client";

import { ErrorView, LoadingView } from "@/components/dashboard";
import { useSuspenseWorkflow } from "@/features/workflows/hooks/use-workflows";
import { useAutosave } from "@/features/workflows/hooks/use-autosave";
import { useTheme } from "next-themes";
import { useState, useCallback, useMemo, useEffect } from "react";
import {
  ReactFlow,
  applyNodeChanges,
  applyEdgeChanges,
  addEdge,
  Background,
  Controls,
  MiniMap,
  Panel,
} from "@xyflow/react";
import type {
  Node,
  Edge,
  NodeChange,
  EdgeChange,
  Connection,
} from "@xyflow/react";
import "@xyflow/react/dist/style.css";
import { nodeComponents } from "@/features/workflows/nodes/node-components";
import { AddNodeButton } from "@/features/workflows/nodes/add-node-button";
import { useAtom, useSetAtom } from "jotai";
import { useQueryStates } from "nuqs";
import { useTRPC } from "@/trpc/client";
import { useQuery } from "@tanstack/react-query";
import {
  editorAtom,
  editorReadOnlyAtom,
  editorRunIdAtom,
  autosaveEnabledAtom,
} from "../store/atoms";
import { editorParams } from "../params";
import { NodeType } from "@/generated/prisma/enums";
import { ExecuteWorkflowButton } from "../../nodes/execute-workflow";
import { useWorkflowExecutionStatus } from "@/features/workflows/hooks/use-workflow-execution-status";
import { NodeOutputDrawer } from "./node-output-drawer";

export const EditorLoading = () => {
  return <LoadingView message="Loading Editor." />;
};
export const EditorError = () => {
  return <ErrorView message="Error Loading Editor" />;
};

export const Editor = ({ workflowID }: { workflowID: string }) => {

  const setEditor = useSetAtom(editorAtom)
  const { data: workflow } = useSuspenseWorkflow(workflowID);

  const [{ run: replayRunId }] = useQueryStates(editorParams);
  const readOnly = Boolean(replayRunId);
  const setReadOnly = useSetAtom(editorReadOnlyAtom);
  const setAutosaveEnabled = useSetAtom(autosaveEnabledAtom);
  const trpc = useTRPC();
  // A plain (non-suspense) query, deliberately: useSuspenseQuery has no
  // `enabled` option — suspense queries are always enabled by design, so
  // gating this fetch on "does a replay param exist" requires the regular
  // useQuery. On a normal (non-replay) visit this simply never fetches.
  const { data: replayRun } = useQuery({
    ...trpc.executions.getById.queryOptions({ id: replayRunId ?? "" }),
    enabled: Boolean(replayRunId),
  });

  const [nodes, setNodes] = useState<Node[]>(workflow.nodes);
  const [edges, setEdges] = useState<Edge[]>(workflow.edges);
  const [replayMismatch, setReplayMismatch] = useState(false);

  // Hydrate node status from the replay run once it loads — same pattern
  // as the live-status effect below (statusMessages), just fed from a
  // fetched run's steps instead of the realtime channel.
  useEffect(() => {
    if (!replayRun) return;
    if (replayRun.workflowId !== workflowID) {
      setReplayMismatch(true);
      return;
    }
    const statusByNodeId = new Map(
      replayRun.steps.map((step) => [
        step.nodeId,
        step.status === "SUCCESS" ? "success" : step.status === "ERROR" ? "error" : "initial",
      ]),
    );
    setNodes((currentNodes) =>
      currentNodes.map((node) =>
        statusByNodeId.has(node.id)
          ? { ...node, data: { ...node.data, status: statusByNodeId.get(node.id) } }
          : node,
      ),
    );
  }, [replayRun, workflowID]);

  // React Flow's Controls/MiniMap/Background ship their own light-oriented
  // default styling — colorMode applies xyflow's built-in dark theme class
  // instead of leaving them stuck light regardless of the app's theme.
  // `mounted` avoids a hydration mismatch, matching the same pattern
  // app-sidebar.tsx uses for its own theme toggle.
  const { resolvedTheme } = useTheme();
  const [mounted, setMounted] = useState(false);
  useEffect(() => {
    setMounted(true);
  }, []);

  useEffect(() => {
    // Unconditional both ways, not just "disable on entry": if this same
    // mounted Editor instance later navigates from a replay URL back to
    // the plain editor route (readOnly: true -> false) without a full
    // remount, autosave must re-enable — not stay silently off for the
    // rest of the session.
    setReadOnly(readOnly);
    setAutosaveEnabled(!readOnly);
  }, [readOnly, setReadOnly, setAutosaveEnabled]);

  const [runId, setRunId] = useAtom(editorRunIdAtom);
  useEffect(() => {
    if (replayRunId) setRunId(replayRunId);
  }, [replayRunId, setRunId]);

  // Autosave hook - saves after 1 second of inactivity. Still called
  // unconditionally (Rules of Hooks) — replay mode instead gates the
  // actual write via autosaveEnabledAtom, set false above.
  useAutosave({
    workflowId: workflowID,
    nodes,
    edges,
    delay: 1000,
  });

  const statusMessages = useWorkflowExecutionStatus(workflowID);
  useEffect(() => {
    if (statusMessages.length === 0) return;
    setNodes((currentNodes) => {
      const statusByNodeId = new Map(statusMessages.map((m) => [m.nodeId, m.status]));
      return currentNodes.map((node) =>
        statusByNodeId.has(node.id)
          ? { ...node, data: { ...node.data, status: statusByNodeId.get(node.id) } }
          : node,
      );
    });
  }, [statusMessages]);

  const handleExecuteStart = useCallback((newRunId: string) => {
    setRunId(newRunId);
    setNodes((currentNodes) =>
      currentNodes.map((node) => ({ ...node, data: { ...node.data, status: "initial" } })),
    );
  }, [setRunId]);

  const onNodesChange = useCallback(
    (changes: NodeChange[]) =>
      setNodes((nodesSnapshot) =>
        applyNodeChanges(changes, nodesSnapshot),
      ),
    [],
  );
  const onEdgesChange = useCallback(
    (changes: EdgeChange[]) =>
      setEdges((edgesSnapshot) =>
        applyEdgeChanges(changes, edgesSnapshot),
      ),
    [],
  );
  const onConnect = useCallback(
    (params: Connection) =>
      setEdges((edgesSnapshot) => addEdge(params, edgesSnapshot)),
    [],
  );

  const hasManualTrigger = useMemo(() => {
    return nodes.some((node) => node.type === NodeType.MANUAL_TRIGGER)
  }, [nodes])

  if (replayMismatch) {
    throw new Error("This run does not belong to this workflow.");
  }

  return (
    <div className="size-full">
      <ReactFlow
        nodes={nodes}
        edges={edges}
        onNodesChange={onNodesChange}
        onEdgesChange={onEdgesChange}
        onConnect={onConnect}
        fitView
        proOptions={{
          hideAttribution: true,
        }}
        nodeTypes={nodeComponents}
        onInit={setEditor}
        colorMode={mounted && resolvedTheme === "dark" ? "dark" : "light"}
        snapGrid={[10, 10]}
        snapToGrid
        panOnScroll
        panOnDrag={false}
        selectionOnDrag
        nodesDraggable={!readOnly}
        nodesConnectable={!readOnly}
        edgesReconnectable={!readOnly}
      >
        <Background />
        <Controls />
        <MiniMap />
        {!readOnly && (
          <Panel position="top-right">
            <AddNodeButton />
          </Panel>
        )}
        {!readOnly && hasManualTrigger && (
          <Panel position="bottom-center">
            <ExecuteWorkflowButton workflowID={workflowID} onExecuteStart={handleExecuteStart} />
          </Panel>
        )}
      </ReactFlow>
      <NodeOutputDrawer runId={runId} />
    </div>
  );
};
