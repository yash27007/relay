-- AlterTable
ALTER TABLE "workflow_run_step" ADD COLUMN     "input" JSONB,
ADD COLUMN     "output" JSONB;
