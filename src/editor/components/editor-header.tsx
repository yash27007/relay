"use client"
import { SidebarTrigger } from "@/components/ui/sidebar";
import { Button } from "@/components/ui/button";
import {
    Breadcrumb,
    BreadcrumbEllipsis,
    BreadcrumbItem,
    BreadcrumbLink,
    BreadcrumbList,
    BreadcrumbPage,
    BreadcrumbSeparator,
} from "@/components/ui/breadcrumb"
import { SaveIcon } from "lucide-react";
import Link from "next/link";
import { useSuspenseWorkflow, useUpdateWorkflowName } from "@/workflows/hooks/use-workflows";
import React, { useEffect, useRef, useState } from "react";
import { Input } from "@/components/ui/input";

export const EditorBreadcrumbs = ({ workflowID }: { workflowID: string }) => {
    return (
        <Breadcrumb>
            <BreadcrumbList>
                <BreadcrumbItem>
                    <BreadcrumbLink asChild>
                        <Link prefetch href="/workflows">Workflows</Link>
                    </BreadcrumbLink>
                </BreadcrumbItem>
                <BreadcrumbSeparator />
                <EditorNameInput workflowID={workflowID} />
            </BreadcrumbList>
        </Breadcrumb>
    )
}
export const EditorSaveButton = ({ workflowID }: { workflowID: string }) => {
    return (
        <div className="ml-auto">
            <Button size="sm" onClick={() => { }} disabled={false}>
                <SaveIcon className="size-4" />
                Save
            </Button>
        </div>
    )

}

export const EditorNameInput = ({ workflowID }: { workflowID: string }) => {
    const { data: workflow } = useSuspenseWorkflow(workflowID);
    const updateWorkflow = useUpdateWorkflowName();
    const [isEditing, setIsEditing] = useState(false);
    const [name, setName] = useState(workflow.name);
    const inputRef = useRef<HTMLInputElement>(null);

    useEffect(() => {
        if (workflow.name) {
            setName(workflow.name)
        }
    }, [workflow.name])

    useEffect(() => {
        if (isEditing && inputRef.current) {
            inputRef.current.focus();
            inputRef.current.select();
        }
    }, [isEditing])

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
            setName(workflow.name)
        } finally {
            setIsEditing(false);
        }
    };

    const handleKeyDown = (e: React.KeyboardEvent) => {
        if (e.key === 'Enter') {
            handleSave();
        } else if (e.key === "Escape") {
            setName(workflow.name)
            setIsEditing(false)
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
        )
    }
    return (
        <BreadcrumbItem onClick={() => setIsEditing(true)} className="cursor-pointer hover:text-foreground transition-colors">
            {workflow?.name}
        </BreadcrumbItem>

    )

}
export const EditorHeader = ({ workflowID }: { workflowID: string }) => {
    return (
        <header className="flex h-14 shrink-0 items-center gap-2 border-b px-4 bg-background">
            <SidebarTrigger />
            <div className="flex flex-row items-center justify-between gap-x-4 w-full">
                <EditorBreadcrumbs workflowID={workflowID} />
                <EditorSaveButton workflowID={workflowID} />
            </div>
        </header>
    );
};

