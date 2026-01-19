"use client";

import { ErrorView, LoadingView } from "@/components/dashboard";
import { useSuspenseWorkflow } from "@/features/workflows/hooks/use-workflows";
import { useAutosave } from "@/features/workflows/hooks/use-autosave";
import { useState, useCallback, useMemo } from "react";
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
import { useSetAtom } from "jotai";
import { editorAtom } from "../store/atoms";
import { NodeType } from "@/generated/prisma/enums";
import { ExecuteWorkflowButton } from "../../nodes/execute-workflow";

export const EditorLoading = () => {
  return <LoadingView message="Loading Editor." />;
};
export const EditorError = () => {
  return <ErrorView message="Error Loading Editor" />;
};

export const Editor = ({ workflowID }: { workflowID: string }) => {

  const setEditor = useSetAtom(editorAtom)
  const { data: workflow } = useSuspenseWorkflow(workflowID);

  const [nodes, setNodes] = useState<Node[]>(workflow.nodes);
  const [edges, setEdges] = useState<Edge[]>(workflow.edges);

  // Autosave hook - saves after 1 second of inactivity
  useAutosave({
    workflowId: workflowID,
    nodes,
    edges,
    delay: 1000,
  });

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
        snapGrid={[10, 10]}
        snapToGrid
        panOnScroll
        panOnDrag={false}
        selectionOnDrag
      >
        <Background />
        <Controls />
        <MiniMap />
        <Panel position="top-right">
          <AddNodeButton />
        </Panel>
        {hasManualTrigger && (
          <Panel position="bottom-center">
            <ExecuteWorkflowButton workflowID={workflowID} />
          </Panel>
        )}
      </ReactFlow>
    </div>
  );
};
