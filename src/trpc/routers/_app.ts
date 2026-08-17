import { workflowsRouter } from "@/features/workflows/server";
import { credentialsRouter } from "@/features/credentials/server";
import { executionsRouter } from "@/features/executions/server";
import { createTRPCRouter } from "../init";
export const appRouter = createTRPCRouter({
  workflows: workflowsRouter,
  credentials: credentialsRouter,
  executions: executionsRouter,
});
export type AppRouter = typeof appRouter;
