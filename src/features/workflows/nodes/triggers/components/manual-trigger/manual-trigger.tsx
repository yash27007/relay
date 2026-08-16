import type { NodeProps } from "@xyflow/react"
import { memo, useState } from "react"
import type { NodeStatus } from "../../../react-flow/status-indicator";
import { BaseTriggerNode } from "../base-trigger-node"
import { MousePointerIcon } from "lucide-react"
import { ManualTriggerDialog } from "./dialog"

export const ManualTriggerNode = memo((props: NodeProps) => {
    const nodeStatus = ((props.data as Record<string, any>)?.status as NodeStatus) ?? "initial"
    const [dialogOpen, setDialogOpen] = useState(false)
    const handleOpenSettings = ()=>setDialogOpen(true)
    return (
        <>
            <ManualTriggerDialog
                open={dialogOpen}
                onOpenChange={setDialogOpen}
            />
            <BaseTriggerNode
                {...props}
                icon={MousePointerIcon}
                name="When clicking 'Execute Workflow'"
                status={nodeStatus}
                onSetting={handleOpenSettings}
                onDoubleClick={handleOpenSettings}
            />

        </>
    )
})

ManualTriggerNode.displayName = "ManualTriggerNode"