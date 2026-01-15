/**
 * NOTE: There are two "workflows" routes in this project:
 *
 * 1. (others)/workflows/page.tsx - The workflows LIST page
 *    - Displays all workflows in a list/grid view
 *    - Uses the "(others)" layout group (likely with sidebar, navigation, etc.)
 *
 * 2. (editor)/workflows/[workflowID]/page.tsx - The workflow EDITOR page (this file)
 *    - Opens a specific workflow by ID for editing
 *    - Uses the "(editor)" layout group (likely a full-screen or focused editor UI)
 *
 * This separation allows different layouts for browsing vs editing workflows:
 * - The list view benefits from standard dashboard navigation
 * - The editor view can have a distraction-free, dedicated editing experience
 *
 * Next.js route groups (parentheses folders) enable this pattern without
 * affecting the URL structure - both resolve under /workflows/*
 * This pattern uses Next.js route groups to apply different layouts (sidebar navigation vs. focused editor) while keeping a clean URL structure.
 */

import { Editor, EditorError } from "@/editor/components/editor";
import { EditorHeader } from "@/editor/components/editor-header";
import { requireAuth } from "@/lib/auth-utils";
import { HydrateClient } from "@/trpc/server";
import { prefetchWorkflow } from "@/workflows/server/prefetch";
import { Suspense } from "react";
import { ErrorBoundary } from "react-error-boundary";

interface PageProps {
  params: Promise<{
    workflowID: string;
  }>;
}

export default async function ExecutionIdPage({ params }: PageProps) {
  requireAuth();
  const { workflowID } = await params;
  prefetchWorkflow(workflowID)
  return (
    <HydrateClient>
      <ErrorBoundary fallback={<EditorError />}>
        <Suspense fallback={<EditorError />}>
          <EditorHeader workflowID={workflowID} />
          <main className="flex-1">
            <Editor workflowID={workflowID} />
          </main>
        </Suspense>
      </ErrorBoundary>
    </HydrateClient>
  );
}
