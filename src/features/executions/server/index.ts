import { z } from "zod";
import { PAGINATION } from "@/config/constants";
import { createTRPCRouter, protectedProcedure } from "@/trpc/init";

export const executionsRouter = createTRPCRouter({
  list: protectedProcedure
    .input(
      z.object({
        page: z.number().default(PAGINATION.DEFAULT_PAGE),
        pageSize: z
          .number()
          .min(PAGINATION.MIN_PAGE_SIZE)
          .max(PAGINATION.MAX_PAGE_SIZE)
          .default(PAGINATION.DEFAULT_PAGE_SIZE),
        workflowId: z.string().optional(),
      }),
    )
    .query(async ({ ctx, input }) => {
      const { page, pageSize, workflowId } = input;
      const where = {
        userId: ctx.auth.user.id,
        ...(workflowId ? { workflowId } : {}),
      };
      const [items, totalCount] = await Promise.all([
        ctx.prisma.workflowRun.findMany({
          where,
          skip: (page - 1) * pageSize,
          take: pageSize,
          orderBy: { startedAt: "desc" },
          include: { workflow: { select: { name: true } } },
        }),
        ctx.prisma.workflowRun.count({ where }),
      ]);
      const totalPages = Math.ceil(totalCount / pageSize);
      return {
        items,
        page,
        pageSize,
        totalCount,
        totalPages,
        hasNextPage: page < totalPages,
        hasPreviousPage: page > 1,
      };
    }),

  getById: protectedProcedure
    .input(z.object({ id: z.string() }))
    .query(async ({ ctx, input }) => {
      return ctx.prisma.workflowRun.findFirstOrThrow({
        where: { id: input.id, userId: ctx.auth.user.id },
        include: {
          workflow: { select: { name: true } },
          steps: { orderBy: { startedAt: "asc" } },
        },
      });
    }),
});
