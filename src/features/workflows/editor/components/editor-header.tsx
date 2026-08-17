"use client";
import { Button } from "@/components/ui/button";
import {
  Breadcrumb,
  BreadcrumbItem,
  BreadcrumbLink,
  BreadcrumbList,
  BreadcrumbSeparator,
} from "@/components/ui/breadcrumb";
import { SaveIcon, LoaderIcon, CheckCircleIcon } from "lucide-react";
import Link from "next/link";
import type { Node } from "@xyflow/react";
import {
  useSuspenseWorkflow,
  useUpdateWorkflow,
  useUpdateWorkflowName,
} from "@/features/workflows/hooks/use-workflows";
import { useEffect, useRef, useState, useId } from "react";
import { Input } from "@/components/ui/input";
import { useAtom, useAtomValue } from "jotai";
import {
  editorAtom,
  editorReadOnlyAtom,
  autosaveEnabledAtom,
  autosaveStatusAtom,
} from "../store/atoms";
import { Switch } from "@/components/ui/switch";
import { Label } from "@/components/ui/label";

export const EditorBreadcrumbs = ({
  workflowID,
}: {
  workflowID: string;
}) => {
  return (
    <Breadcrumb>
      <BreadcrumbList>
        <BreadcrumbItem>
          <BreadcrumbLink asChild>
            <Link prefetch href="/workflows">
              Workflows
            </Link>
          </BreadcrumbLink>
        </BreadcrumbItem>
        <BreadcrumbSeparator />
        <EditorNameInput workflowID={workflowID} />
      </BreadcrumbList>
    </Breadcrumb>
  );
};
// `status` on node.data is a transient, per-run execution indicator (set
// live by useWorkflowExecutionStatus / reset by handleExecuteStart in
// Editor) — it must never be persisted or treated as a "real" edit.
// Identical logic to the `stripStatus` helper in use-autosave.ts, kept
// local here since Save's persistence path is independent of autosave's.
const stripStatus = (node: Node): Node => {
  if (!node.data || !("status" in node.data)) return node;
  const { status: _status, ...rest } = node.data as Record<string, unknown>;
  return { ...node, data: rest };
};

export const EditorSaveButton = ({
  workflowID: _workflowID,
}: {
  workflowID: string;
}) => {

  const editor = useAtomValue(editorAtom)
  const saveWorkflow = useUpdateWorkflow({ showToast: true })
  const handleSave = () => {
    if (!editor) {
      return
    }
    console.log("hello")
    const nodes = editor.getNodes().map(stripStatus)
    const edges = editor.getEdges()
    saveWorkflow.mutate({
      id: _workflowID,
      nodes,
      edges
    })
  }

  return (
    <Button size="sm" onClick={handleSave} disabled={saveWorkflow.isPending}>
      <SaveIcon className="size-4" />
      Save
    </Button>
  );
};

export const AutosaveToggle = () => {
  const [autosaveEnabled, setAutosaveEnabled] = useAtom(autosaveEnabledAtom);
  const { isSaving, lastSaved } = useAtomValue(autosaveStatusAtom);
  const autosaveId = useId();

  return (
    <div className="flex items-center gap-3">
      {autosaveEnabled && (
        <div className="flex items-center gap-1.5 text-sm text-muted-foreground">
          {isSaving ? (
            <>
              <LoaderIcon className="h-4 w-4 animate-spin" />
              <span>Saving...</span>
            </>
          ) : lastSaved ? (
            <>
              <CheckCircleIcon className="h-4 w-4 text-green-500" />
              <span>Saved</span>
            </>
          ) : null}
        </div>
      )}
      <div className="flex items-center gap-2">
        <Switch
          id={autosaveId}
          checked={autosaveEnabled}
          onCheckedChange={setAutosaveEnabled}
        />
        <Label htmlFor={autosaveId} className="text-sm cursor-pointer">
          Autosave
        </Label>
      </div>
    </div>
  );
};

export const EditorNameInput = ({
  workflowID,
}: {
  workflowID: string;
}) => {
  const { data: workflow } = useSuspenseWorkflow(workflowID);
  const updateWorkflow = useUpdateWorkflowName();
  const [isEditing, setIsEditing] = useState(false);
  const [name, setName] = useState(workflow.name);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (workflow.name) {
      setName(workflow.name);
    }
  }, [workflow.name]);

  useEffect(() => {
    if (isEditing && inputRef.current) {
      inputRef.current.focus();
      inputRef.current.select();
    }
  }, [isEditing]);

  const handleSave = async () => {
    if (name === workflow.name) {
      setIsEditing(false);
      return;
    }

    try {
      await updateWorkflow.mutateAsync({
        id: workflowID,
        name,
      });
    } catch {
      setName(workflow.name);
    } finally {
      setIsEditing(false);
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "Enter") {
      handleSave();
    } else if (e.key === "Escape") {
      setName(workflow.name);
      setIsEditing(false);
    }
  };

  if (isEditing) {
    return (
      <Input
        disabled={updateWorkflow.isPending}
        ref={inputRef}
        value={name}
        onChange={(e) => setName(e.target.value)}
        onBlur={handleSave}
        onKeyDown={handleKeyDown}
        className="h-7 w-auto min-w-[100px] px-2"
      />
    );
  }
  return (
    <BreadcrumbItem
      onClick={() => setIsEditing(true)}
      className="cursor-pointer hover:text-foreground transition-colors"
    >
      {workflow?.name}
    </BreadcrumbItem>
  );
};
export const EditorHeader = ({
  workflowID,
}: {
  workflowID: string;
}) => {
  const readOnly = useAtomValue(editorReadOnlyAtom);
  return (
    <header className="flex h-14 shrink-0 items-center gap-2 border-b px-4 bg-background">
      <div className="flex flex-row items-center justify-between gap-x-4 w-full">
        <EditorBreadcrumbs workflowID={workflowID} />
        <div className="ml-auto flex items-center gap-4">
          {!readOnly && (
            <>
              <AutosaveToggle />
              <EditorSaveButton workflowID={workflowID} />
            </>
          )}
        </div>
      </div>
    </header>
  );
};
