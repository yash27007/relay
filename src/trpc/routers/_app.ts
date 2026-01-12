import { inngest } from "@/inngest/client";
import { createTRPCRouter, protectedProcedure } from "../init";
export const appRouter = createTRPCRouter({
  getWorkflows: protectedProcedure.query(({ ctx }) => {
    return ctx.prisma.workflow.findMany();
  }),

  createWorkflow: protectedProcedure.mutation(async ({ ctx }) => {
    await inngest.send({
      name: "test/hello.world",
    });
    return {success:true, message: "Job Queued"};
  }),
});
// export type definition of API
export type AppRouter = typeof appRouter;
