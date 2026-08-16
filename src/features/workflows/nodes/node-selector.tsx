"use client"
import {
    GitBranchIcon,
    GlobeIcon,
    MousePointerIcon,
    SplitIcon
} from "lucide-react"
import { createId } from "@paralleldrive/cuid2"
import type React from "react"

import {
    Sheet,
    SheetContent,
    SheetDescription,
    SheetHeader,
    SheetTitle,
    SheetTrigger
} from "@/components/ui/sheet"

import { NodeType } from "@/generated/prisma/enums"
import Image from "next/image"
import { Separator } from "@/components/ui/separator"
import { useReactFlow } from "@xyflow/react"
import { useCallback } from "react"
import { toast } from "sonner"


export type NodeTypeOption = {
    type: NodeType,
    label: string,
    description: string,
    icon: React.ComponentType<{ className?: string }> | string;
};

const triggerNodes: NodeTypeOption[] = [


    {
        type: NodeType.MANUAL_TRIGGER,
        label: "Trigger Manually",
        description: "Runs the flow on clicking a button. Good for getting started quickly",
        icon: MousePointerIcon
    },
];

const executionNodes: NodeTypeOption[] = [
    {
        type: NodeType.HTTP_REQUEST,
        label: "HTTP Request",
        description: "Makes an HTTP request",
        icon: GlobeIcon
    },
    {
        type: NodeType.IF,
        label: "IF",
        description: "Branch the workflow based on a condition",
        icon: GitBranchIcon
    },
    {
        type: NodeType.SWITCH,
        label: "Switch",
        description: "Route the workflow to a matching case",
        icon: SplitIcon
    },
];

interface NodeSelectorProps {
    open: boolean;
    onOpenChange: (open: boolean) => void;
    children: React.ReactNode;
};

export function NodeSelector({
    open,
    onOpenChange,
    children
}: NodeSelectorProps) {
    const { setNodes, getNodes, screenToFlowPosition } = useReactFlow();
    const handleNodeSelect = useCallback((selection: NodeTypeOption) => {
        // check if manual trigger already exists before adding one
        if (selection.type === NodeType.MANUAL_TRIGGER) {
            const nodes = getNodes();
            const hasManualTrigger = nodes.some(
                (node) => node.type === NodeType.MANUAL_TRIGGER,
            )
            if (hasManualTrigger) {
                toast.error("Only one manual trigger is allowed per workflow")
                return;
            }
        }

        setNodes((nodes) => {
            const hasInitialTrigger = nodes.some(
                (node) => node.type === NodeType.INITIAL,
            );
            const centerX = window.innerWidth / 2;
            const centerY = window.innerHeight / 2;

            // Converting window position to flow position and positioning it little bit off the center so that they do not overlap
            const flowPosition = screenToFlowPosition({
                x: centerX + (Math.random() - 0.5) * 200,
                y: centerY + (Math.random() - 0.5) * 200
            });

            const newNode = {
                id: createId(),
                data: {},
                position: flowPosition,
                type: selection.type
            };

            if (hasInitialTrigger) {
                return [newNode]
            }

            return [...nodes, newNode]

        })
        onOpenChange(false)
    }, [
        setNodes,
        getNodes,
        onOpenChange,
        screenToFlowPosition
    ])
    return (
        <Sheet open={open} onOpenChange={onOpenChange}>
            <SheetTrigger asChild>{children}</SheetTrigger>
            <SheetContent side="right" className="w-full sm:max-w-md overflow-y-auto">

                <SheetHeader>
                    <SheetTitle>
                        Add a Node
                    </SheetTitle>
                    <SheetDescription>
                        Choose a node to add to your workflow.
                    </SheetDescription>
                </SheetHeader>

                {/* Triggers Section */}
                <div className="mt-6">
                    <div className="px-4 mb-2">
                        <h3 className="text-sm font-semibold text-foreground">Triggers</h3>
                        <p className="text-xs text-muted-foreground">Start your workflow with one of these</p>
                    </div>
                    {triggerNodes.map((nodeType) => {
                        const Icon = nodeType.icon
                        return (
                            <button
                                type="button"
                                key={nodeType.type}
                                className="w-full justify-start h-auto py-5 px-4 rounded-none cursor-pointer border-l-2 border-transparent hover:border-l-primary"
                                onClick={() => handleNodeSelect(nodeType)}
                            >
                                <div className="flex items-center gap-6 w-full overflow-hidden">
                                    {typeof Icon === "string" ? (
                                        <Image
                                            src={Icon}
                                            alt={nodeType.label}
                                            className="size-5 object-contain rounded-sm"
                                        />

                                    ) : (
                                        <Icon className="size-5" />
                                    )}

                                    <div className="flex flex-col items-start text-left">
                                        <span className="font-medium text-sm">{nodeType.label}</span>
                                        <span className="text-xs text-muted-foreground">{nodeType.description}</span>
                                    </div>

                                </div>
                            </button>
                        )
                    })}
                </div>

                <Separator className="my-4" />

                {/* Actions Section */}
                <div>
                    <div className="px-4 mb-2">
                        <h3 className="text-sm font-semibold text-foreground">Actions</h3>
                        <p className="text-xs text-muted-foreground">Perform operations in your workflow</p>
                    </div>
                    {executionNodes.map((nodeType) => {
                        const Icon = nodeType.icon
                        return (
                            <button
                                type="button"
                                key={nodeType.type}
                                className="w-full justify-start h-auto py-5 px-4 rounded-none cursor-pointer border-l-2 border-transparent hover:border-l-primary"
                                onClick={() => handleNodeSelect(nodeType)}
                            >
                                <div className="flex items-center gap-6 w-full overflow-hidden">
                                    {typeof Icon === "string" ? (
                                        <Image
                                            src={Icon}
                                            alt={nodeType.label}
                                            className="size-5 object-contain rounded-sm"
                                        />

                                    ) : (
                                        <Icon className="size-5" />
                                    )}

                                    <div className="flex flex-col items-start text-left">
                                        <span className="font-medium text-sm">{nodeType.label}</span>
                                        <span className="text-xs text-muted-foreground">{nodeType.description}</span>
                                    </div>

                                </div>
                            </button>
                        )
                    })}
                </div>
            </SheetContent>
        </Sheet>
    )
}
