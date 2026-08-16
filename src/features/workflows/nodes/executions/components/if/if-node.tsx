"use client";

import { Node, NodeProps, useReactFlow } from "@xyflow/react";

import { GitBranchIcon } from "lucide-react";
import { memo, useState } from "react";
import { BaseBranchNode } from "../base-branch-node";
import {
  IfFormValues,
  IfNodeDialog,
  OPERATOR_LABELS,
} from "./dialog";

type IfNodeData = Partial<IfFormValues>;

type IfNodeType = Node<IfNodeData>;

export const IfNode = memo((props: NodeProps<IfNodeType>) => {
  const { setNodes } = useReactFlow();

  const [dialogOpen, setDialogOpen] = useState(false);
  const handleOpenSettings = () => setDialogOpen(true);

  const handleSubmit = (values: IfFormValues) => {
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
  const description = nodeData?.operator
    ? `${nodeData.value || "value"} ${OPERATOR_LABELS[nodeData.operator]}${
        nodeData.compareValue ? ` ${nodeData.compareValue}` : ""
      }`
    : "Not Configured";

  return (
    <>
      <IfNodeDialog
        open={dialogOpen}
        onOpenChange={setDialogOpen}
        onSubmit={handleSubmit}
        defaultValues={nodeData}
      />
      <BaseBranchNode
        {...props}
        id={props.id}
        icon={GitBranchIcon}
        name="IF"
        description={description}
        status={nodeStatus}
        outputs={[
          { id: "true", label: "True" },
          { id: "false", label: "False" },
        ]}
        onSetting={handleOpenSettings}
        onDoubleClick={handleOpenSettings}
      />
    </>
  );
});

IfNode.displayName = "IfNode";
