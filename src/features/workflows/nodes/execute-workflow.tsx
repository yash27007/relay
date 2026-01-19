import { Button } from "@/components/ui/button";
import { FlaskConicalIcon } from "lucide-react";
import { useExecuteWorkflow } from "../hooks/use-workflows";


export const ExecuteWorkflowButton = ({ workflowID }: { workflowID: string }) => {
    const executeWorkflow = useExecuteWorkflow();
    const handleExecute = () => {
        executeWorkflow.mutate({ id: workflowID })
    }
    return (
        <Button size="lg" disabled={executeWorkflow.isPending} onClick={handleExecute} >
            <FlaskConicalIcon className="size-4" />
            Execute Workflow
        </Button>
    )
}