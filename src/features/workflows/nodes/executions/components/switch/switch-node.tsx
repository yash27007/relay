"use client";

import { Node, NodeProps, useReactFlow } from "@xyflow/react";
import { useAtomValue } from "jotai";

import { SplitIcon } from "lucide-react";
import { memo, useState } from "react";
import { editorRunIdAtom } from "@/features/workflows/editor/store/atoms";
import type { NodeStatus } from "../../../react-flow/status-indicator";
import { BaseBranchNode, type BranchOutput } from "../base-branch-node";
import { SwitchFormValues, SwitchNodeDialog } from "./dialog";

type SwitchNodeData = Partial<SwitchFormValues>;

type SwitchNodeType = Node<SwitchNodeData>;

export const SwitchNode = memo((props: NodeProps<SwitchNodeType>) => {
  const { setNodes, setEdges } = useReactFlow();
  const runId = useAtomValue(editorRunIdAtom);

  const [dialogOpen, setDialogOpen] = useState(false);
  const handleOpenSettings = () => setDialogOpen(true);

  const handleSubmit = (values: SwitchFormValues) => {
    const previousCaseIds = new Set((props.data?.cases ?? []).map((c) => c.id));
    const nextCaseIds = new Set(values.cases.map((c) => c.id));
    const removedCaseIds = [...previousCaseIds].filter((id) => !nextCaseIds.has(id));

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

    // A case that's been removed from the dialog no longer has an output
    // handle on the canvas — any edge still wired to it would otherwise
    // dangle: persisted, unreachable, and with no visual owner.
    if (removedCaseIds.length > 0) {
      const removedHandleIds = new Set(
        removedCaseIds.map((id) => `${props.id}-${id}-source`),
      );
      setEdges((edges) =>
        edges.filter(
          (edge) => !(edge.source === props.id && removedHandleIds.has(edge.sourceHandle ?? "")),
        ),
      );
    }
  };

  const nodeStatus = ((props.data as Record<string, unknown>)?.status as NodeStatus) ?? "initial";
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
        nodeId={props.id}
        runId={runId}
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
