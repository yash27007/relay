import { createTRPCRouter } from "../init";
import { workflowsRouter } from "@/workflows/server";
export const appRouter = createTRPCRouter({
  workflows: workflowsRouter,
});
export type AppRouter = typeof appRouter;
