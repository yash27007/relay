"use client";

import { Node, NodeProps, useReactFlow } from "@xyflow/react";

import type { LucideIcon } from "lucide-react";
import { memo, useState } from "react";
import type { AIProviderType } from "@/features/credentials/lib/ai-providers";
import type { NodeStatus } from "../../../react-flow/status-indicator";
import { BaseExecutionNode } from "../base-execution-node";
import { AiFormValues, AiNodeDialog } from "./ai-dialog";

type AiNodeData = Partial<AiFormValues>;

type AiNodeType = Node<AiNodeData>;

interface CreateAiNodeOptions {
  providerType: AIProviderType;
  providerLabel: string;
  /** A lucide icon component, or a path to an SVG under public/ (e.g. "/openai.svg"). */
  icon: LucideIcon | string;
}

/**
 * Builds the canvas component for an AI-provider node. Every provider is a
 * thin instantiation of this — same dialog, same BaseExecutionNode shell,
 * differing only in icon/label/which credential type the picker filters by.
 */
export function createAiNode({ providerType, providerLabel, icon }: CreateAiNodeOptions) {
  const AiNode = memo((props: NodeProps<AiNodeType>) => {
    const { setNodes } = useReactFlow();

    const [dialogOpen, setDialogOpen] = useState(false);
    const handleOpenSettings = () => setDialogOpen(true);

    const handleSubmit = (values: AiFormValues) => {
      setNodes((nodes) =>
        nodes.map((node) => {
          if (node.id === props.id) {
            return {
              ...node,
              data: {
                ...node.data,
                ...values,
              },
            };
          }
          return node;
        }),
      );
    };

    const nodeStatus = ((props.data as Record<string, any>)?.status as NodeStatus) ?? "initial";
    const nodeData = props.data;
    const description = nodeData?.userPrompt
      ? `{{${nodeData.variableName || "myAi"}.text}}`
      : "Not Configured";

    return (
      <>
        <AiNodeDialog
          open={dialogOpen}
          onOpenChange={setDialogOpen}
          onSubmit={handleSubmit}
          defaultValues={nodeData}
          providerType={providerType}
          providerLabel={providerLabel}
        />
        <BaseExecutionNode
          {...props}
          id={props.id}
          icon={icon}
          name={providerLabel}
          description={description}
          status={nodeStatus}
          onSetting={handleOpenSettings}
          onDoubleClick={handleOpenSettings}
        />
      </>
    );
  });

  AiNode.displayName = `${providerLabel}Node`;
  return AiNode;
}
