import { workflowsRouter } from "@/features/workflows/server";
import { credentialsRouter } from "@/features/credentials/server";
import { createTRPCRouter } from "../init";
export const appRouter = createTRPCRouter({
  workflows: workflowsRouter,
  credentials: credentialsRouter,
});
export type AppRouter = typeof appRouter;
