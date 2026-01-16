"use client"

import { type NodeProps, Position, useReactFlow } from "@xyflow/react"

import type { LucideIcon } from "lucide-react"

import Image from "next/image"

import { memo, type ReactNode } from "react"

import { BaseNode, BaseNodeContent } from "../../react-flow/base-node"
import { BaseHandle } from "../../react-flow/base-handle"
import { WorkflowNode } from "../../workflow-node"
import type { NodeStatus } from "../../react-flow/status-indicator"
interface BaseTriggerNodeProps extends NodeProps {
    icon: LucideIcon | string;
    name: string;
    description?: string;
    children?: ReactNode;
    status?: NodeStatus;
    onSetting?: () => void;
    onDoubleClick?: () => void;
}

export const BaseTriggerNode = memo(
    ({
        id,
        icon: Icon,
        name,
        children,
        description,
        status = "initial",
        onSetting,
        onDoubleClick
    }: BaseTriggerNodeProps) => {
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
                <BaseNode
                    onDoubleClick={onDoubleClick}
                    className="rounded-l-2xl relative group"
                    status={status}
                    statusClassName="rounded-l-2xl"
                >
                    <BaseNodeContent>
                        {typeof Icon === "string" ? (
                            <Image src={Icon}
                                alt={name}
                                width={16}
                                height={16} />
                        ) : (
                            <Icon className="size-4 text-muted-foreground" />
                        )}
                        {children}
                        <BaseHandle
                            id={`${id}-source`}
                            type="source"
                            position={Position.Right}
                        />
                    </BaseNodeContent>
                </BaseNode>
            </WorkflowNode>
        )
    });

BaseTriggerNode.displayName = "BaseTriggerNode";