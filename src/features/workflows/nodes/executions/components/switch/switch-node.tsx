"use client";

import { Node, NodeProps, useReactFlow } from "@xyflow/react";

import { SplitIcon } from "lucide-react";
import { memo, useState } from "react";
import { BaseBranchNode, type BranchOutput } from "../base-branch-node";
import { SwitchFormValues, SwitchNodeDialog } from "./dialog";

type SwitchNodeData = Partial<SwitchFormValues>;

type SwitchNodeType = Node<SwitchNodeData>;

export const SwitchNode = memo((props: NodeProps<SwitchNodeType>) => {
  const { setNodes } = useReactFlow();

  const [dialogOpen, setDialogOpen] = useState(false);
  const handleOpenSettings = () => setDialogOpen(true);

  const handleSubmit = (values: SwitchFormValues) => {
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

  const nodeStatus = "initial";
  const nodeData = props.data;
  const cases = nodeData?.cases ?? [];
  const description = nodeData?.value
    ? `${nodeData.value} → ${cases.length} case${cases.length === 1 ? "" : "s"} + Default`
    : "Not Configured";

  const outputs: BranchOutput[] = [
    ...cases.map((switchCase) => ({
      id: switchCase.id,
      label: switchCase.value || "Case",
    })),
    { id: "default", label: "Default" },
  ];

  return (
    <>
      <SwitchNodeDialog
        open={dialogOpen}
        onOpenChange={setDialogOpen}
        onSubmit={handleSubmit}
        defaultValues={nodeData}
      />
      <BaseBranchNode
        {...props}
        id={props.id}
        icon={SplitIcon}
        name="Switch"
        description={description}
        status={nodeStatus}
        outputs={outputs}
        onSetting={handleOpenSettings}
        onDoubleClick={handleOpenSettings}
      />
    </>
  );
});

SwitchNode.displayName = "SwitchNode";
