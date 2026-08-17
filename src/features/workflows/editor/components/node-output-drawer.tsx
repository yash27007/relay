"use client";

import { Suspense } from "react";
import { ErrorBoundary } from "react-error-boundary";
import { useAtom } from "jotai";
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";
import { LoadingView, ErrorView } from "@/components/dashboard";
import { useTRPC } from "@/trpc/client";
import { useSuspenseQuery } from "@tanstack/react-query";
import { selectedOutputNodeIdAtom } from "../store/atoms";

interface JsonPanelProps {
  label: string;
  value: unknown;
}

function JsonPanel({ label, value }: JsonPanelProps) {
  const isTruncated =
    value !== null &&
    typeof value === "object" &&
    "truncated" in (value as Record<string, unknown>);

  return (
    <div className="flex flex-col gap-1.5">
      <h4 className="text-sm font-medium">{label}</h4>
      {value === undefined || value === null ? (
        <p className="text-xs text-muted-foreground">Not captured for this step.</p>
      ) : isTruncated ? (
        <p className="rounded-md border bg-muted/30 p-3 text-xs text-muted-foreground">
          Too large to display ({(value as { byteLength: number }).byteLength.toLocaleString()}{" "}
          characters).
        </p>
      ) : (
        <pre className="max-h-64 overflow-auto rounded-md border bg-muted/30 p-3 font-mono text-xs">
          {JSON.stringify(value, null, 2)}
        </pre>
      )}
    </div>
  );
}

interface DrawerContentProps {
  runId: string;
  nodeId: string;
}

const DrawerContent = ({ runId, nodeId }: DrawerContentProps) => {
  const trpc = useTRPC();
  const { data: run } = useSuspenseQuery(trpc.executions.getById.queryOptions({ id: runId }));
  const runStep = run.steps.find((step) => step.nodeId === nodeId);

  if (!runStep) {
    return (
      <p className="text-sm text-muted-foreground">
        No execution data for this node in the current run.
      </p>
    );
  }

  return (
    <div className="flex flex-col gap-6">
      <div>
        <p className="text-sm font-medium">{runStep.nodeName}</p>
        <p className="text-xs text-muted-foreground">{runStep.nodeType}</p>
      </div>
      {runStep.error && (
        <div className="rounded-lg border border-destructive/30 bg-destructive/5 p-3 text-sm text-destructive">
          {runStep.error}
        </div>
      )}
      <JsonPanel label="Input" value={runStep.input} />
      <JsonPanel label="Output" value={runStep.output} />
    </div>
  );
};

interface NodeOutputDrawerProps {
  runId: string | null;
}

export const NodeOutputDrawer = ({ runId }: NodeOutputDrawerProps) => {
  const [selectedNodeId, setSelectedNodeId] = useAtom(selectedOutputNodeIdAtom);
  const open = selectedNodeId !== null;

  return (
    <Sheet open={open} onOpenChange={(next) => !next && setSelectedNodeId(null)}>
      <SheetContent className="overflow-y-auto">
        <SheetHeader>
          <SheetTitle>Node output</SheetTitle>
          <SheetDescription>Input and output data for this node's last run.</SheetDescription>
        </SheetHeader>
        <div className="px-4 pb-4">
          {selectedNodeId && runId && (
            <ErrorBoundary fallback={<ErrorView message="Couldn't load this node's output" />}>
              <Suspense fallback={<LoadingView message="Loading output..." />}>
                <DrawerContent runId={runId} nodeId={selectedNodeId} />
              </Suspense>
            </ErrorBoundary>
          )}
          {selectedNodeId && !runId && (
            <p className="text-sm text-muted-foreground">
              No run to show output for yet — execute this workflow first.
            </p>
          )}
        </div>
      </SheetContent>
    </Sheet>
  );
};
