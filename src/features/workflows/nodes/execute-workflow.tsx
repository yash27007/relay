import { Button } from "@/components/ui/button";
import { FlaskConicalIcon } from "lucide-react";
import { useExecuteWorkflow } from "../hooks/use-workflows";

interface Props {
  workflowID: string;
  onExecuteStart?: (runId: string) => void;
}

export const ExecuteWorkflowButton = ({ workflowID, onExecuteStart }: Props) => {
  const executeWorkflow = useExecuteWorkflow();
  const handleExecute = () => {
    executeWorkflow.mutate(
      { id: workflowID },
      {
        onSuccess: (data) => {
          onExecuteStart?.(data.runId);
        },
      },
    );
  };
  return (
    <Button size="lg" disabled={executeWorkflow.isPending} onClick={handleExecute}>
      <FlaskConicalIcon className="size-4" />
      Execute Workflow
    </Button>
  );
};
