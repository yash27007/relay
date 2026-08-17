"use client";
import { formatDistanceToNow } from "date-fns";
import { CheckCircle2Icon, CircleDashedIcon, XCircleIcon } from "lucide-react";
import Link from "next/link";
import { useState } from "react";
import type { ComponentType } from "react";
import {
  EntityContainer,
  EntityHeader,
  EntityPagination,
  ErrorView,
  LoadingView,
} from "@/components/dashboard";
import { Badge } from "@/components/ui/badge";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import type { RunStatus } from "@/generated/prisma/enums";
import { ExecutionDetailSheet } from "./execution-detail-sheet";
import { useExecutionParams } from "../hooks/use-execution-params";
import { useSuspenseExecutions } from "../hooks/use-executions";

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

export const ExecutionsHeader = () => {
  return <EntityHeader title="Executions" description="History of every workflow run." />;
};

export const ExecutionsPagination = () => {
  const executions = useSuspenseExecutions();
  const [params, setParams] = useExecutionParams();
  return (
    <EntityPagination
      disabled={executions.isFetching}
      totalPages={executions.data.totalPages}
      page={executions.data.page}
      onPageChange={(page) => setParams({ ...params, page })}
    />
  );
};

export const ExecutionsContainer = ({ children }: { children: React.ReactNode }) => {
  return (
    <EntityContainer header={<ExecutionsHeader />} pagination={<ExecutionsPagination />}>
      {children}
    </EntityContainer>
  );
};

export const ExecutionsLoading = () => {
  return <LoadingView message="Loading executions..." />;
};

export const ExecutionsError = () => {
  return <ErrorView message="Error loading executions" />;
};

export const ExecutionsList = () => {
  const executions = useSuspenseExecutions();
  const [selectedRunId, setSelectedRunId] = useState<string | null>(null);

  if (executions.data.items.length === 0) {
    return (
      <div className="flex flex-1 items-center justify-center py-16">
        <p className="text-sm text-muted-foreground">
          No runs yet — execute a workflow to see its history here.
        </p>
      </div>
    );
  }

  return (
    <>
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead>Workflow</TableHead>
            <TableHead>Status</TableHead>
            <TableHead>Started</TableHead>
            <TableHead>Duration</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {executions.data.items.map((run) => {
            const meta = STATUS_META[run.status];
            return (
              <TableRow
                key={run.id}
                className="cursor-pointer"
                onClick={() => setSelectedRunId(run.id)}
              >
                <TableCell>
                  <Link
                    href={`/workflows/${run.workflowId}?run=${run.id}`}
                    className="hover:underline"
                    onClick={(event) => event.stopPropagation()}
                  >
                    {run.workflow.name}
                  </Link>
                </TableCell>
                <TableCell>
                  <Badge variant="outline" className={`gap-1.5 ${meta.className}`}>
                    <meta.icon className="size-3.5" />
                    {meta.label}
                  </Badge>
                </TableCell>
                <TableCell className="text-muted-foreground">
                  {formatDistanceToNow(run.startedAt, { addSuffix: true })}
                </TableCell>
                <TableCell className="text-muted-foreground">
                  {formatRunDuration(run.startedAt, run.completedAt)}
                </TableCell>
              </TableRow>
            );
          })}
        </TableBody>
      </Table>
      <ExecutionDetailSheet
        runId={selectedRunId}
        onOpenChange={(open) => !open && setSelectedRunId(null)}
      />
    </>
  );
};
