"use client";
import { Suspense } from "react";
import { ErrorBoundary } from "react-error-boundary";
import { formatDistanceToNow } from "date-fns";
import { CheckCircle2Icon, CircleDashedIcon, XCircleIcon } from "lucide-react";
import type { ComponentType } from "react";
import Link from "next/link";
import { Button } from "@/components/ui/button";
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";
import { Badge } from "@/components/ui/badge";
import { LoadingView, ErrorView } from "@/components/dashboard";
import type { RunStatus } from "@/generated/prisma/enums";
import { useSuspenseExecution } from "../hooks/use-executions";

const STATUS_META: Record<
  RunStatus,
  { label: string; icon: ComponentType<{ className?: string }>; className: string }
> = {
  RUNNING: { label: "Running", icon: CircleDashedIcon, className: "text-muted-foreground" },
  SUCCESS: { label: "Success", icon: CheckCircle2Icon, className: "text-emerald-600 dark:text-emerald-400" },
  ERROR: { label: "Error", icon: XCircleIcon, className: "text-destructive" },
};

function formatRunDuration(startedAt: Date | string, completedAt: Date | string | null): string {
  if (!completedAt) return "—";
  const ms = new Date(completedAt).getTime() - new Date(startedAt).getTime();
  if (ms < 1000) return `${ms}ms`;
  const seconds = ms / 1000;
  if (seconds < 60) return `${seconds.toFixed(1)}s`;
  const minutes = Math.floor(seconds / 60);
  const remainingSeconds = Math.round(seconds % 60);
  return `${minutes}m ${remainingSeconds}s`;
}

interface ExecutionDetailContentProps {
  runId: string;
}

const ExecutionDetailContent = ({ runId }: ExecutionDetailContentProps) => {
  const { data: run } = useSuspenseExecution(runId);
  const meta = STATUS_META[run.status];

  return (
    <div className="flex flex-col gap-6">
      <div className="flex items-center gap-3">
        <Badge variant="outline" className={`gap-1.5 ${meta.className}`}>
          <meta.icon className="size-3.5" />
          {meta.label}
        </Badge>
        <span className="text-sm text-muted-foreground">
          Started {formatDistanceToNow(run.startedAt, { addSuffix: true })} · ran for{" "}
          {formatRunDuration(run.startedAt, run.completedAt)}
        </span>
      </div>
      <Button variant="outline" size="sm" asChild className="self-start">
        <Link href={`/workflows/${run.workflowId}?run=${run.id}`}>View in canvas</Link>
      </Button>

      {run.error && (
        <div className="rounded-lg border border-destructive/30 bg-destructive/5 p-3 text-sm text-destructive">
          {run.error}
        </div>
      )}

      <div className="flex flex-col gap-3">
        <h3 className="text-sm font-medium">Steps</h3>
        {run.steps.length === 0 && (
          <p className="text-sm text-muted-foreground">No steps recorded for this run.</p>
        )}
        <ol className="flex flex-col gap-3">
          {run.steps.map((runStep) => {
            const stepMeta = STATUS_META[runStep.status];
            return (
              <li key={runStep.id} className="flex flex-col gap-1 rounded-lg border p-3">
                <div className="flex items-center gap-2">
                  <stepMeta.icon className={`size-4 ${stepMeta.className}`} />
                  <span className="text-sm font-medium">{runStep.nodeName}</span>
                  <span className="text-xs text-muted-foreground">{runStep.nodeType}</span>
                  <span className="ml-auto text-xs text-muted-foreground">
                    {formatRunDuration(runStep.startedAt, runStep.completedAt)}
                  </span>
                </div>
                {runStep.error && (
                  <p className="text-xs text-destructive">{runStep.error}</p>
                )}
              </li>
            );
          })}
        </ol>
      </div>
    </div>
  );
};

interface ExecutionDetailSheetProps {
  runId: string | null;
  onOpenChange: (open: boolean) => void;
}

export const ExecutionDetailSheet = ({ runId, onOpenChange }: ExecutionDetailSheetProps) => {
  return (
    <Sheet open={runId !== null} onOpenChange={onOpenChange}>
      <SheetContent className="overflow-y-auto">
        <SheetHeader>
          <SheetTitle>Run details</SheetTitle>
          <SheetDescription>Step-by-step history for this execution.</SheetDescription>
        </SheetHeader>
        <div className="px-4 pb-4">
          {runId && (
            <ErrorBoundary fallback={<ErrorView message="Couldn't load this run" />}>
              <Suspense fallback={<LoadingView message="Loading run..." />}>
                <ExecutionDetailContent runId={runId} />
              </Suspense>
            </ErrorBoundary>
          )}
        </div>
      </SheetContent>
    </Sheet>
  );
};
