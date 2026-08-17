"use client";

import { type Node, type NodeProps, Position, useReactFlow } from "@xyflow/react";
import { BotIcon } from "lucide-react";
import { memo, useState } from "react";
import { BaseHandle } from "../../../react-flow/base-handle";
import { BaseNode, BaseNodeContent } from "../../../react-flow/base-node";
import { NodeStatus, NodeStatusIndicator } from "../../../react-flow/status-indicator";
import { NodeIcon } from "../../../node-icon";
import { WorkflowNode } from "../../../workflow-node";
import { toolTargetHandleId } from "../../lib/tool-connections";
import { AgentFormValues, AgentNodeDialog } from "./dialog";
import type { AgentNodeData } from "./types";

type AgentNodeType = Node<AgentNodeData>;

/**
 * Not built on BaseExecutionNode — it needs a second *target* handle (for
 * incoming tool connections), a different shape than BaseExecutionNode's
 * `toolCapable` second *source* handle. Composed from the same low-level
 * primitives BaseExecutionNode itself uses, the way BaseBranchNode does for
 * its own different-shaped handle set.
 */
export const AgentNode = memo((props: NodeProps<AgentNodeType>) => {
  const { id, data } = props;
  const { setNodes, setEdges } = useReactFlow();

  const [dialogOpen, setDialogOpen] = useState(false);
  const handleOpenSettings = () => setDialogOpen(true);

  const handleDelete = () => {
    setNodes((currentNodes) => currentNodes.filter((node) => node.id !== id));
    setEdges((currentEdges) =>
      currentEdges.filter((edge) => edge.source !== id && edge.target !== id),
    );
  };

  const handleSubmit = (values: AgentFormValues) => {
    setNodes((nodes) =>
      nodes.map((node) => (node.id === id ? { ...node, data: { ...node.data, ...values } } : node)),
    );
  };

  const nodeStatus = ((data as Record<string, unknown>)?.status as NodeStatus) ?? "initial";
  const description = data?.userPrompt
    ? `{{${data.variableName || "myAgent"}.text}}`
    : "Not Configured";

  return (
    <>
      <AgentNodeDialog
        open={dialogOpen}
        onOpenChange={setDialogOpen}
        onSubmit={handleSubmit}
        defaultValues={data}
      />
      <WorkflowNode
        name="AI Agent"
        description={description}
        onDelete={handleDelete}
        onSettings={handleOpenSettings}
      >
        <NodeStatusIndicator status={nodeStatus} variant="border">
          <BaseNode id={id} status={nodeStatus} onDoubleClick={handleOpenSettings}>
            <BaseNodeContent>
              <NodeIcon icon={BotIcon} label="AI Agent" className="size-4 text-muted-foreground" />
              <BaseHandle id={`${id}-target`} type="target" position={Position.Left} />
              <BaseHandle id={`${id}-source`} type="source" position={Position.Right} />
              <BaseHandle
                id={toolTargetHandleId(id)}
                type="target"
                position={Position.Bottom}
                title="Connect tools here"
              />
            </BaseNodeContent>
          </BaseNode>
        </NodeStatusIndicator>
      </WorkflowNode>
    </>
  );
});

AgentNode.displayName = "AgentNode";
