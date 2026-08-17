"use client";

import { useReactFlow } from "@xyflow/react";
import { BracesIcon } from "lucide-react";
import { useMemo } from "react";
import { Button } from "@/components/ui/button";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import { useTRPC } from "@/trpc/client";
import { useQuery } from "@tanstack/react-query";
import { findAncestorVariables } from "../lib/find-ancestor-variables";

// Good-enough starting points before a workflow has ever run, so a user
// can write a working expression without guessing. Once a run exists,
// PickerContent prefers the *real* captured output for any ancestor that
// actually produced one (see flattenKeys below).
const KNOWN_SHAPES: Record<string, string[]> = {
  HTTP_REQUEST: ["httpResponse.status", "httpResponse.statusText", "httpResponse.data"],
  OPENAI: ["text"],
  ANTHROPIC: ["text"],
  GEMINI: ["text"],
  GROQ: ["text"],
  DEEPSEEK: ["text"],
  MISTRAL: ["text"],
  MOONSHOT: ["text"],
  OLLAMA: ["text"],
  AGENT: ["text"],
};

/** Dot-joined paths through a plain object's own keys, up to `depth` levels
 * deep. Arrays and primitives become leaf paths rather than being expanded
 * further — enough to write a useful expression without dumping an
 * unbounded tree for a large response body. */
function flattenKeys(value: unknown, prefix = "", depth = 2): string[] {
  if (depth === 0 || value === null || typeof value !== "object" || Array.isArray(value)) {
    return prefix ? [prefix] : [];
  }
  return Object.entries(value as Record<string, unknown>).flatMap(([key, nested]) =>
    flattenKeys(nested, prefix ? `${prefix}.${key}` : key, depth - 1),
  );
}

interface VariablePickerProps {
  nodeId: string;
  runId?: string | null;
  value: string;
  cursorPosition: number;
  onInsert: (nextValue: string) => void;
}

export function VariablePicker({
  nodeId,
  runId,
  value,
  cursorPosition,
  onInsert,
}: VariablePickerProps) {
  const { getNodes, getEdges } = useReactFlow();
  const trpc = useTRPC();
  const { data: run } = useQuery({
    ...trpc.executions.getById.queryOptions({ id: runId ?? "" }),
    enabled: Boolean(runId),
  });

  const ancestors = useMemo(
    () => findAncestorVariables(getNodes(), getEdges(), nodeId),
    [getNodes, getEdges, nodeId],
  );

  const handleInsert = (path: string) => {
    const token = `{{${path}}}`;
    const next = value.slice(0, cursorPosition) + token + value.slice(cursorPosition);
    onInsert(next);
  };

  if (ancestors.length === 0) {
    return null;
  }

  return (
    <Popover>
      <PopoverTrigger asChild>
        <Button type="button" variant="ghost" size="icon-sm" aria-label="Insert a variable">
          <BracesIcon className="size-4" />
        </Button>
      </PopoverTrigger>
      <PopoverContent className="w-72 p-2" align="start">
        <div className="flex max-h-72 flex-col gap-3 overflow-y-auto">
          {ancestors.map((ancestor) => {
            const runStep = run?.steps.find((step) => step.nodeId === ancestor.nodeId);
            const realPaths =
              runStep?.output && typeof runStep.output === "object"
                ? flattenKeys(runStep.output).filter((path) =>
                    path.startsWith(`${ancestor.variableName}.`),
                  )
                : [];
            const paths =
              realPaths.length > 0
                ? realPaths
                : (KNOWN_SHAPES[ancestor.nodeType] ?? []).map(
                    (path) => `${ancestor.variableName}.${path}`,
                  );

            return (
              <div key={ancestor.nodeId} className="flex flex-col gap-1">
                <p className="text-xs font-medium text-muted-foreground">
                  {ancestor.variableName}
                </p>
                {paths.length === 0 ? (
                  <button
                    type="button"
                    onClick={() => handleInsert(ancestor.variableName)}
                    className="rounded-sm px-2 py-1 text-left font-mono text-xs hover:bg-accent"
                  >
                    {`{{${ancestor.variableName}}}`}
                  </button>
                ) : (
                  paths.map((path) => (
                    <button
                      key={path}
                      type="button"
                      onClick={() => handleInsert(path)}
                      className="rounded-sm px-2 py-1 text-left font-mono text-xs hover:bg-accent"
                    >
                      {`{{${path}}}`}
                    </button>
                  ))
                )}
              </div>
            );
          })}
        </div>
      </PopoverContent>
    </Popover>
  );
}
