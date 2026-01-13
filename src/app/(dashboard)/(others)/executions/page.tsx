import { requireAuth } from "@/lib/auth-utils"

export default async function ExecutionsPage() {
    requireAuth()
    return (
        <p>Executions</p>
    )
}