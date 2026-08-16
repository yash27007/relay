"use client"

import { Node, NodeProps, useReactFlow } from "@xyflow/react"

import { GlobeIcon } from "lucide-react"
import { memo, useState } from "react";
import type { NodeStatus } from "../../../react-flow/status-indicator";
import { BaseExecutionNode } from "../base-execution-node";
import { HttpRequestFormValues, HttpRequestNodeDialog } from "./dialog";

type HttpRequestNodeData = {
    variableName?: string;
    endpoint?: string;
    method?: "GET" | "PUT" | "POST" | "PATCH" | "DELETE";
    body?: string;
};

type HttpRequestNodeType = Node<HttpRequestNodeData>;

export const HttpRequestNode = memo((props: NodeProps<HttpRequestNodeType>) => {

    const { setNodes } = useReactFlow()



    const [dialogOpen, setDialogOpen] = useState(false)
    const handleOpenSettings = () => setDialogOpen(true)

    const handleSubmit = (values: HttpRequestFormValues) => {
        setNodes((nodes) => nodes.map((node => {
            if (node.id === props.id) {
                return {
                    ...node,
                    data: {
                        ...node.data,
                        ...values
                    }
                }
            }
            return node
        })))
    }

    const nodeStatus = ((props.data as Record<string, any>)?.status as NodeStatus) ?? "initial"
    const nodeData = props.data;
    const description = nodeData?.endpoint
        ? `${nodeData.method || "GET"}: ${nodeData.endpoint}`
        : "Not Configured"

    return (
        <>
            <HttpRequestNodeDialog
                open={dialogOpen}
                onOpenChange={setDialogOpen}
                onSubmit={handleSubmit}
                defaultValues={nodeData}
            />
            <BaseExecutionNode
                {...props}
                id={props.id}
                icon={GlobeIcon}
                name="HTTP Request"
                description={description}
                status={nodeStatus}
                onSetting={handleOpenSettings}
                onDoubleClick={handleOpenSettings}
            />
        </>
    )
})

HttpRequestNode.displayName = "HttpRequestNode";