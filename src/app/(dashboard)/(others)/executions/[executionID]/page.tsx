import { requireAuth } from "@/lib/auth-utils";

interface PageProps {
  params: Promise<{
    executionID: string;
  }>;
}

export default async function ExecutionIdPage({ params }: PageProps) {
  requireAuth();
  const { executionID } = await params;
  return <p>Execution id: {executionID}</p>;
}
