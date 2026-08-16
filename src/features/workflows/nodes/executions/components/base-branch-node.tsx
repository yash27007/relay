"use client";

import { type NodeProps, Position, useReactFlow } from "@xyflow/react";

import type { LucideIcon } from "lucide-react";

import Image from "next/image";

import { memo, type ReactNode } from "react";

import { BaseNode, BaseNodeContent } from "../../react-flow/base-node";
import { BaseHandle } from "../../react-flow/base-handle";
import { WorkflowNode } from "../../workflow-node";
import { NodeStatus, NodeStatusIndicator } from "../../react-flow/status-indicator";

export interface BranchOutput {
  id: string;
  label: string;
}

interface BaseBranchNodeProps extends NodeProps {
  icon: LucideIcon | string;
  name: string;
  description?: string;
  children?: ReactNode;
  status?: NodeStatus;
  outputs: BranchOutput[];
  onSetting?: () => void;
  onDoubleClick?: () => void;
}

export const BaseBranchNode = memo(
  ({
    id,
    icon: Icon,
    name,
    children,
    status = "initial",
    description,
    outputs,
    onSetting,
    onDoubleClick,
  }: BaseBranchNodeProps) => {
    const { setNodes, setEdges } = useReactFlow();
    const handleDelete = () => {
      setNodes((currentNodes) => {
        const updatedNodes = currentNodes.filter((node) => node.id !== id);
        return updatedNodes;
      });

      setEdges((currentEdges) => {
        const updatedEdges = currentEdges.filter(
          (edge) => edge.source !== id && edge.target !== id,
        );
        return updatedEdges;
      });
    };
    return (
      <WorkflowNode
        name={name}
        description={description}
        onDelete={handleDelete}
        onSettings={onSetting}
      >
        <NodeStatusIndicator status={status} variant="border">
          <BaseNode status={status} onDoubleClick={onDoubleClick}>
            <BaseNodeContent>
              {typeof Icon === "string" ? (
                <Image src={Icon} alt={name} width={16} height={16} />
              ) : (
                <Icon className="size-4 text-muted-foreground" />
              )}
              {children}
              <BaseHandle id={`${id}-target`} type="target" position={Position.Left} />
              {outputs.map((output, index) => (
                <BaseHandle
                  key={output.id}
                  id={`${id}-${output.id}-source`}
                  type="source"
                  position={Position.Right}
                  title={output.label}
                  style={{ top: `${((index + 1) / (outputs.length + 1)) * 100}%` }}
                />
              ))}
            </BaseNodeContent>
          </BaseNode>
        </NodeStatusIndicator>
      </WorkflowNode>
    );
  },
);

BaseBranchNode.displayName = "BaseBranchNode";
