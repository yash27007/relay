"use client";

import { type Node, type NodeProps, Position } from "@xyflow/react";
import type { LucideIcon } from "lucide-react";
import { memo } from "react";
import { NodeIcon } from "@/features/workflows/nodes/node-icon";
import { BaseHandle } from "@/features/workflows/nodes/react-flow/base-handle";
import {
  BaseNode,
  BaseNodeContent,
} from "@/features/workflows/nodes/react-flow/base-node";
import type { NodeStatus } from "@/features/workflows/nodes/react-flow/status-indicator";

export type LandingDemoNodeData = {
  label: string;
  icon: LucideIcon | string;
  status: NodeStatus;
  showTarget: boolean;
  showSource: boolean;
};

export type LandingDemoNodeType = Node<
  LandingDemoNodeData,
  "landingDemo"
>;

/**
 * The hero's demo diagram, rendered with the app's real node primitives
 * (BaseNode/BaseHandle/NodeIcon) instead of a look-alike. `status` flows
 * straight into BaseNode, which already knows how to draw the same
 * loading/success border the real editor shows during a live run — nothing
 * here reimplements that visual language, it just borrows it.
 */
export const LandingDemoNode = memo(function LandingDemoNode({
  id,
  data,
}: NodeProps<LandingDemoNodeType>) {
  const { label, icon, status, showTarget, showSource } = data;

  return (
    <BaseNode status={status} className="w-32 cursor-default">
      {showTarget && (
        <BaseHandle
          id={`${id}-target`}
          type="target"
          position={Position.Left}
        />
      )}
      <BaseNodeContent className="items-center py-4 text-center">
        <NodeIcon icon={icon} label={label} imageSize={24} />
        <span className="font-mono-plex text-[11px] whitespace-nowrap text-muted-foreground">
          {label}
        </span>
      </BaseNodeContent>
      {showSource && (
        <BaseHandle
          id={`${id}-source`}
          type="source"
          position={Position.Right}
        />
      )}
    </BaseNode>
  );
});
