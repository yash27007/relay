"use client";
import { useRouter } from "next/navigation";
import {
    EntityContainer,
    EntityHeader,
    EntityPagination,
    EntitySearch,
    LoadingView,
    ErrorView,
    EmptyView,
    EntityList,
    EntityItem
} from "@/components/dashboard";
import { formatDistanceToNow } from "date-fns";

import type { Workflow } from "@/generated/prisma/client";

import { useUpgradeModal } from "@/hooks/use-upgrade-modal";
import {
    useCreateWorkflow,
    useRemoveWorkflow,
    useSuspenseWorkflows,
} from "../hooks/use-workflows";
import { useWorkflowParams } from "../hooks/use-workflow-params";
import { useEntitySearch } from "@/hooks/use-entity-search";
import { WorkflowIcon } from "lucide-react";
import { id } from "date-fns/locale";

export const WorkflowSearch = () => {
    const [params, setParams] = useWorkflowParams();
    const { searchValue, onSearchChange } = useEntitySearch({
        params,
        setParams,
    });
    return (
        <EntitySearch
            value={searchValue}
            onChange={onSearchChange}
            placeholder="Search Workflows"
        />
    );
};
export const WorkflowsList = () => {
    const workflows = useSuspenseWorkflows();
    return (
        // since we are using generics, the type of item is passed along all the component
        <EntityList
            items={workflows.data.items}
            getKey={(workflow) => workflow.id}
            renderItem={(workflow) => <WorkflowItem data={workflow} />}
            emptyView={<WorkflowsEmpty />}
        />
    )
};

export const WorkflowsHeader = ({
    disabled,
}: {
    disabled?: boolean;
}) => {
    const router = useRouter();
    const createWorkflow = useCreateWorkflow();
    const { handleError, modal } = useUpgradeModal();
    const handleCreate = () => {
        createWorkflow.mutate(undefined, {
            onSuccess: (data) => {
                router.push(`/workflows/${data.id}`);
            },
            onError: (error) => {
                handleError(error);
            },
        });
    };
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
    );
};
export const WorkflowsPagination = () => {
    const workflows = useSuspenseWorkflows();
    const [params, setParams] = useWorkflowParams();
    return (
        <EntityPagination
            disabled={workflows.isFetching}
            totalPages={workflows.data.totalPages}
            page={workflows.data.page}
            onPageChange={(page) => setParams({ ...params, page })}
        />
    );
};

export const WorkflowsLoading = () => {
    return <LoadingView message="Loading Workflows..." />
}
export const WorkflowsError = () => {
    return <ErrorView message="Error Loading Workflows" />
}

export const WorkflowsEmpty = () => {
    const router = useRouter();
    const createWorkflow = useCreateWorkflow()
    const { handleError, modal } = useUpgradeModal()
    const handleCreate = () => {
        createWorkflow.mutate(undefined, {
            onSuccess: (data) => {
                router.push(`/workflows/${data.id}`);
            },
            onError: (error) => {
                handleError(error);
            },
        });
    }
    return (
        <>
            {modal}
            <EmptyView
                onNew={handleCreate

                }
                title="No workflows found!!"
                message="Get started by creating your first workflow"
                buttonText="Create workflow"
            />

        </>
    )
}

export const WorkflowsContainer = ({
    children,
}: {
    children: React.ReactNode;
}) => {
    return (
        <EntityContainer
            header={<WorkflowsHeader />}
            search={<WorkflowSearch />}
            pagination={<WorkflowsPagination />}
        >
            {children}
        </EntityContainer>
    );
};

export const WorkflowItem = ({ data }: { data: Workflow }) => {
    const removeWorkflow = useRemoveWorkflow()
    const handleRemove = ()=>{
        removeWorkflow.mutate({id:data.id})
    } 
    return (
        <EntityItem
            href={`/workflows/${data.id}`}
            title={data.name}
            subtitle={
                <>
                    Updated {formatDistanceToNow(data.updatedAt, {
                        addSuffix: true
                    })}{" "}
                    &bull; Created{" "}{formatDistanceToNow(data.createdAt, {
                        addSuffix: true
                    })}
                </>
            }
            image={
                <div className="size-8 flex items-center justify-center">
                    <WorkflowIcon className=" size-5 text-muted-foreground" />
                </div>
            }
            onRemove={handleRemove}
            isRemoving={removeWorkflow.isPending}

        />
    )
}