import { requireAuth } from "@/lib/auth-utils";

export default async function WorkflowPage() {
  requireAuth();
  return <p>Workflow</p>;
}
