-- CreateEnum
CREATE TYPE "RunStatus" AS ENUM ('RUNNING', 'SUCCESS', 'ERROR');

-- CreateTable
CREATE TABLE "workflow_run" (
    "id" TEXT NOT NULL,
    "workflowId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "status" "RunStatus" NOT NULL DEFAULT 'RUNNING',
    "startedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "completedAt" TIMESTAMP(3),
    "error" TEXT,

    CONSTRAINT "workflow_run_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "workflow_run_step" (
    "id" TEXT NOT NULL,
    "runId" TEXT NOT NULL,
    "nodeId" TEXT NOT NULL,
    "nodeName" TEXT NOT NULL,
    "nodeType" TEXT NOT NULL,
    "status" "RunStatus" NOT NULL DEFAULT 'RUNNING',
    "startedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "completedAt" TIMESTAMP(3),
    "error" TEXT,

    CONSTRAINT "workflow_run_step_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "workflow_run_userId_startedAt_idx" ON "workflow_run"("userId", "startedAt");

-- CreateIndex
CREATE INDEX "workflow_run_workflowId_startedAt_idx" ON "workflow_run"("workflowId", "startedAt");

-- CreateIndex
CREATE INDEX "workflow_run_step_runId_idx" ON "workflow_run_step"("runId");

-- CreateIndex
CREATE UNIQUE INDEX "workflow_run_step_runId_nodeId_key" ON "workflow_run_step"("runId", "nodeId");

-- AddForeignKey
ALTER TABLE "workflow_run" ADD CONSTRAINT "workflow_run_workflowId_fkey" FOREIGN KEY ("workflowId") REFERENCES "Workflow"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "workflow_run_step" ADD CONSTRAINT "workflow_run_step_runId_fkey" FOREIGN KEY ("runId") REFERENCES "workflow_run"("id") ON DELETE CASCADE ON UPDATE CASCADE;
