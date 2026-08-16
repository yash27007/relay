"use client"

import { type NodeProps, Position, useReactFlow } from "@xyflow/react"

import type { LucideIcon } from "lucide-react"

import { memo, type ReactNode } from "react"

import { BaseNode, BaseNodeContent } from "../../react-flow/base-node"
import { BaseHandle } from "../../react-flow/base-handle"
import { WorkflowNode } from "../../workflow-node"
import { NodeStatus, NodeStatusIndicator } from "../../react-flow/status-indicator"
import { NodeIcon } from "../../node-icon"
import { toolSourceHandleId } from "../lib/tool-connections"
interface BaseExecutionNodeProps extends NodeProps {
    icon: LucideIcon | string;
    name: string;
    description?: string;
    children?: ReactNode;
    status?: NodeStatus;
    /** Renders a second source handle (bottom) an Agent node can wire into as a tool. */
    toolCapable?: boolean;
    onSetting?: () => void;
    onDoubleClick?: () => void;
}

export const BaseExecutionNode = memo(
    ({
        id,
        icon: Icon,
        name,
        children,
        status = "initial",
        description,
        toolCapable = false,
        onSetting,
        onDoubleClick
    }: BaseExecutionNodeProps) => {

        const { setNodes, setEdges } = useReactFlow()
        const handleDelete = () => {
            setNodes((currentNodes) => {
                const updatedNodes = currentNodes.filter((node) => node.id !== id);
                return updatedNodes;
            });

            setEdges((currentEdges) => {
                const updatedEdges = currentEdges.filter((edge) => edge.source !== id && edge.target !== id)
                return updatedEdges;
            });

        }
        return (
            <WorkflowNode
                name={name}
                description={description}
                onDelete={handleDelete}
                onSettings={onSetting}
            >
                <NodeStatusIndicator
                    status={status}
                    variant="border"

                >


                    <BaseNode status={status} onDoubleClick={onDoubleClick}>
                        <BaseNodeContent>
                            <NodeIcon icon={Icon} label={name} className="size-4 text-muted-foreground" imageSize={16} />
                            {children}
                            <BaseHandle
                                id={`${id}-target`}
                                type="target"
                                position={Position.Left}
                            />
                            <BaseHandle
                                id={`${id}-source`}
                                type="source"
                                position={Position.Right}
                            />
                            {toolCapable && (
                                <BaseHandle
                                    id={toolSourceHandleId(id)}
                                    type="source"
                                    position={Position.Bottom}
                                    title="Use as an AI tool"
                                />
                            )}
                        </BaseNodeContent>
                    </BaseNode>
                </NodeStatusIndicator>
            </WorkflowNode>
        )
    });

BaseExecutionNode.displayName = "BaseExecutionNode";
