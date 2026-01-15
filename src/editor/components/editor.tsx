"use client"

import { ErrorView, LoadingView } from "@/components/dashboard"
import { useSuspenseWorkflow } from "@/workflows/hooks/use-workflows"

export const EditorLoading = () => {
    return <LoadingView message="Loading Editor." />
}
export const EditorError = () => {
    return <ErrorView message="Error Loading Editor" />
}
export const Editor = ({ workflowID }: { workflowID: string }) => {
    const { data: workflow } = useSuspenseWorkflow(workflowID)
    return (
        <p>
            {JSON.stringify(workflow, null, 2)}
        </p>
    )
}