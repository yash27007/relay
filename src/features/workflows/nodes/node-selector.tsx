"use client"
import {
    BotIcon,
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
import { NodeIcon } from "./node-icon"
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
    {
        type: NodeType.AGENT,
        label: "AI Agent",
        description: "Run a multi-step AI agent that can call tools",
        icon: BotIcon
    },
    {
        type: NodeType.OPENAI,
        label: "OpenAI",
        description: "Generate text with an OpenAI model",
        icon: "/openai.svg"
    },
    {
        type: NodeType.ANTHROPIC,
        label: "Anthropic",
        description: "Generate text with an Anthropic model",
        icon: "/anthropic.svg"
    },
    {
        type: NodeType.GEMINI,
        label: "Gemini",
        description: "Generate text with a Gemini model",
        icon: "/gemini.svg"
    },
    {
        type: NodeType.GROQ,
        label: "Groq",
        description: "Generate text with a Groq-hosted model",
        icon: "/groq.svg"
    },
];

interface NodeSelectorProps {
    open: boolean;
    onOpenChange: (open: boolean) => void;
    children: React.ReactNode;
};

// Approximate footprint of a node (including its toolbar/label), used only
// to decide whether two positions would visually overlap — not an exact
// measurement.
const NODE_FOOTPRINT = { width: 180, height: 100 };

function overlaps(
    a: { x: number; y: number },
    b: { x: number; y: number },
): boolean {
    return (
        Math.abs(a.x - b.x) < NODE_FOOTPRINT.width &&
        Math.abs(a.y - b.y) < NODE_FOOTPRINT.height
    );
}

/**
 * Returns `desired` if it doesn't overlap any existing node, otherwise
 * searches outward in a ring pattern for the nearest position that's clear
 * of every existing node. Falls back to `desired` if nothing clear is found
 * within a reasonable search radius.
 */
function findClearPosition(
    desired: { x: number; y: number },
    existing: { x: number; y: number }[],
): { x: number; y: number } {
    if (!existing.some((position) => overlaps(position, desired))) {
        return desired;
    }

    // Escaping a coincident node needs at least NODE_FOOTPRINT.height (a
    // straight vertical step) or .width (straight horizontal) — a smaller
    // ring 1 radius would always land inside the overlap it's trying to
    // clear, wasting the first pass on guaranteed misses.
    const ringStep = Math.min(NODE_FOOTPRINT.width, NODE_FOOTPRINT.height);
    for (let ring = 1; ring <= 10; ring++) {
        const radius = ring * ringStep;
        const pointsOnRing = ring * 8;
        for (let i = 0; i < pointsOnRing; i++) {
            const angle = (i / pointsOnRing) * 2 * Math.PI;
            const candidate = {
                x: desired.x + radius * Math.cos(angle),
                y: desired.y + radius * Math.sin(angle),
            };
            if (!existing.some((position) => overlaps(position, candidate))) {
                return candidate;
            }
        }
    }

    return desired;
}

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
            const desiredPosition = screenToFlowPosition({
                x: centerX + (Math.random() - 0.5) * 200,
                y: centerY + (Math.random() - 0.5) * 200
            });

            // Random jitter alone still collides often when several nodes
            // land near the same spot — nudge outward from any existing
            // node until the new one has clear space.
            const flowPosition = hasInitialTrigger
                ? desiredPosition
                : findClearPosition(desiredPosition, nodes.map((node) => node.position));

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
                                    <NodeIcon icon={Icon} label={nodeType.label} />

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
                                    <NodeIcon icon={Icon} label={nodeType.label} />

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
