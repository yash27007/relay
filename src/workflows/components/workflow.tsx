"use client"
import { useUpgradeModal } from "@/hooks/use-upgrade-modal";
import { useCreateWorkflow, useSuspenseWorkflows } from "../hooks/use-workflows";
import { EntityHeader, EntityContainer } from "@/components/dashboard";
import { router } from "better-auth/api";
import { useRouter } from "next/navigation";
import { toast } from "sonner";

export const WorkflowsList = () => {
    const workflows = useSuspenseWorkflows();
    return (
        <div className="flex flex-1 justify-center items-center">
            <p>{JSON.stringify(workflows.data, null, 2)}</p>

        </div>
    )
}

export const WorkflowsHeader = ({ disabled }: { disabled?: boolean }) => {
    const router = useRouter()
    const createWorkflow = useCreateWorkflow()
    const { handleError, modal } = useUpgradeModal()
    const handleCreate = () => {
        createWorkflow.mutate(undefined, {
            onSuccess: (data) => {
                router.push(`/workflows/${data.id}`)

            },
            onError: (error) => {
                handleError(error)
            },
        })
    }
    return (
        <>
            {modal}
            <EntityHeader
                title="Workflows"
                description="Create and manage your workflows"
                onNew={handleCreate}
                newButtonLabel="New Workflow"
                disabled={disabled}
                iscreating={createWorkflow.isPending}
            />
        </>
    )
}


export const WorkflowsContainer = ({
    children
}: { children: React.ReactNode }) => {
    return (
        <EntityContainer
            header={<WorkflowsHeader />}
            search={<></>}
            pagination={<></>}
        >
            {children}
        </EntityContainer>
    )
}