import { NodeExecutor } from "../../../executions/types";
type ManualTriggerData = Record<string,unknown>
export const manualTriggerExecutor : NodeExecutor<ManualTriggerData> = async ({
    nodeId,
    context,
    step
}) =>{
    // TODO PUBLISH loading state for manual trigger

    const result = await step.run("manual-trigger",async()=> context)

    // TODO Publish success State for maual trigger
    return result
}