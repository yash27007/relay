import type { ComponentProps } from "react";

import { cn } from "@/lib/utils";
import { type NodeStatus, NodeStatusIndicator } from "./status-indicator";
import { CheckCircleIcon, LoaderCircleIcon, XCircleIcon } from "lucide-react";

interface BaseNodeProps extends ComponentProps<"div"> {
  status?: NodeStatus;
  statusClassName?: string;
}

export function BaseNode({
  className,
  status,
  statusClassName,
  children,
  ...props
}: BaseNodeProps) {
  const nodeContent = (
    <div
      className={cn(
        "bg-card text-card-foreground relative rounded-md border",
        "hover:ring-1",
        // React Flow displays node elements inside of a `NodeWrapper` component,
        // which compiles down to a div with the class `react-flow__node`.
        // When a node is selected, the class `selected` is added to the
        // `react-flow__node` element. This allows us to style the node when it
        // is selected, using Tailwind's `&` selector.
        "[.react-flow\\_\\_node.selected_&]:border-muted-foreground",
        "[.react-flow\\_\\_node.selected_&]:shadow-lg",
        className,
      )}
      // biome-ignore lint/a11y/noNoninteractiveTabindex:>
      tabIndex={0}
      {...props}
    >
      {children}
      {status === "error" && (
        <XCircleIcon className="absolute right-1.5 bottom-1.5 size-2 text-red-500 fill-red-100" />
      )}
      {status === "success" && (
        <CheckCircleIcon className="absolute right-1.5 bottom-1.5 size-2 text-emerald-500 fill-emerald-100" />
      )}
      {status === "loading" && (
        <LoaderCircleIcon className="absolute right-0.5 bottom-0.5 size-2 text-blue-500 animate-spin" />
      )}
    </div>
  );

  if (status && status !== "initial") {
    return (
      <div className="relative">
        <NodeStatusIndicator status={status} className={statusClassName}>
          {nodeContent}
        </NodeStatusIndicator>
      </div>
    );
  }

  return nodeContent;
}

/**
 * A container for a consistent header layout intended to be used inside the
 * `<BaseNode />` component.
 */
export function BaseNodeHeader({
  className,
  ...props
}: ComponentProps<"header">) {
  return (
    <header
      {...props}
      className={cn(
        "mx-0 my-0 -mb-1 flex flex-row items-center justify-between gap-2 px-3 py-2",
        // Remove or modify these classes if you modify the padding in the
        // `<BaseNode />` component.
        className,
      )}
    />
  );
}

/**
 * The title text for the node. To maintain a native application feel, the title
 * text is not selectable.
 */
export function BaseNodeHeaderTitle({
  className,
  ...props
}: ComponentProps<"h3">) {
  return (
    <h3
      data-slot="base-node-title"
      className={cn(
        "user-select-none flex-1 font-semibold",
        className,
      )}
      {...props}
    />
  );
}

export function BaseNodeContent({
  className,
  ...props
}: ComponentProps<"div">) {
  return (
    <div
      data-slot="base-node-content"
      className={cn("flex flex-col gap-y-2 p-3", className)}
      {...props}
    />
  );
}

export function BaseNodeFooter({
  className,
  ...props
}: ComponentProps<"div">) {
  return (
    <div
      data-slot="base-node-footer"
      className={cn(
        "flex flex-col items-center gap-y-2 border-t px-3 pt-2 pb-3",
        className,
      )}
      {...props}
    />
  );
}
