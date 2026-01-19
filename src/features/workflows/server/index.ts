import { generateSlug } from "random-word-slugs";
import z from "zod";
import { PAGINATION } from "@/config/constants";
import {
  createTRPCRouter,
  premiumProcedure,
  protectedProcedure,
} from "@/trpc/init";
import { NodeType } from "@/generated/prisma/enums";
import type { Edge, Node } from "@xyflow/react";
import { inngest } from "@/inngest/client";

export const workflowsRouter = createTRPCRouter({
  execute: protectedProcedure
  .input(z.object({id:z.string()}))
  .mutation(async({ctx,input})=>{
    const workflow = ctx.prisma.workflow.findFirstOrThrow({
      where:{
        id:input.id,
        userId:ctx.auth.user.id
      },
    });

    await inngest.send({
      name:"workflows/execute.workflow",
      data:{
        workflowID: input.id
      }
    })
    
    return workflow
  }),

  create: premiumProcedure.mutation(({ ctx }) => {
    return ctx.prisma.workflow.create({
      data: {
        name: generateSlug(3),
        userId: ctx.auth.user.id,
        nodes: {
          create: {
            type: NodeType.INITIAL,
            position: { x: 0, y: 0 },
            name: NodeType.INITIAL,
          },
        },
      },
    });
  }),
  remove: protectedProcedure
    .input(z.object({ id: z.string() }))
    .mutation(({ ctx, input }) => {
      return ctx.prisma.workflow.delete({
        where: {
          id: input.id,
          userId: ctx.auth.user.id,
        },
      });
    }),

  update: protectedProcedure
    .input(
      z.object({
        id: z.string(),
        nodes: z.array(
          z.object({
            id: z.string(),
            type: z.string().nullish(),
            position: z.object({ x: z.number(), y: z.number() }),
            data: z.record(z.string(), z.any()).optional(),
          })
        ),
        edges: z.array(
          z.object({
            id: z.string().optional(),
            source: z.string(),
            target: z.string(),
            sourceHandle: z.string().nullish(),
            targetHandle: z.string().nullish(),
          })
        ),
      })
    )
    .mutation(async ({ ctx, input }) => {
      const { id, nodes, edges } = input;

      // Verify workflow belongs to user
      await ctx.prisma.workflow.findUniqueOrThrow({
        where: {
          id,
          userId: ctx.auth.user.id,
        },
      });

      // Update workflow in a transaction
      return ctx.prisma.$transaction(async (tx) => {
        // Delete existing nodes and connections
        await tx.node.deleteMany({
          where: { workflowId: id },
        });
        await tx.connection.deleteMany({
          where: { workflowId: id },
        });

        // Create new nodes
        await tx.node.createMany({
          data: nodes.map((node) => ({
            id: node.id,
            workflowId: id,
            type: (node.type as NodeType) || NodeType.INITIAL,
            position: node.position,
            data: node.data || {},
            name: node.type || NodeType.INITIAL,
          })),
        });

        // Create new connections/edges
        // Checking if the data exitss 
        if (edges.length > 0) {
          await tx.connection.createMany({
            data: edges.map((edge) => ({
              workflowId: id,
              fromNodeId: edge.source,
              toNodeId: edge.target,
              fromOutput: edge.sourceHandle || "main",
              toInput: edge.targetHandle || "main",
            })),
          });
        }

        // Update the workflow's updatedAt timestamp
        return tx.workflow.update({
          where: { id },
          data: { updatedAt: new Date() },
        });
      });
    }),
  updateName: protectedProcedure
    .input(
      z.object({
        id: z.string(),
        name: z.string().min(1, "Name cannot be empty"),
      })
    )
    .mutation(({ ctx, input }) => {
      return ctx.prisma.workflow.update({
        where: {
          id: input.id,
          userId: ctx.auth.user.id,
        },
        data: {
          name: input.name,
        },
      });
    }),
  getWorkflowbyId: protectedProcedure
    .input(z.object({ id: z.string() }))
    .query(async ({ ctx, input }) => {
      const workflow = await ctx.prisma.workflow.findUniqueOrThrow({
        where: {
          id: input.id,
          userId: ctx.auth.user.id,
        },
        include: { nodes: true, connections: true },
      });
      //  Transforming server nodes to react flow server nodes
      const nodes: Node[] = workflow.nodes.map((node) => ({
        id: node.id,
        type: node.type,
        position: node.position as { x: number; y: number },
        data: (node.data as Record<string, unknown>) || {},
      }));

      // Transform connections to react flow compatable edges

      const edges: Edge[] = workflow.connections.map((connection) => ({
        id: connection.id,
        source: connection.fromNodeId,
        target: connection.toNodeId,
        sourceHandle: connection.fromOutput,
        targetHandle: connection.toInput,
      }));

      return {
        id: workflow.id,
        name: workflow.name,
        nodes,
        edges,
      };
    }),

  getAllWorkflows: protectedProcedure
    .input(
      z.object({
        page: z.number().default(PAGINATION.DEFAULT_PAGE),
        pageSize: z
          .number()
          .min(PAGINATION.MIN_PAGE_SIZE)
          .max(PAGINATION.MAX_PAGE_SIZE)
          .default(PAGINATION.DEFAULT_PAGE_SIZE),
        search: z.string().default(""),
      })
    )
    .query(async ({ ctx, input }) => {
      const { page, pageSize, search } = input;
      const [items, totalCount] = await Promise.all([
        ctx.prisma.workflow.findMany({
          skip: (page - 1) * pageSize,
          take: pageSize,
          where: {
            userId: ctx.auth.user.id,
            name: {
              contains: search,
              mode: "insensitive",
            },
          },
          orderBy: {
            updatedAt: "desc",
          },
        }),
        ctx.prisma.workflow.count({
          where: {
            userId: ctx.auth.user.id,
            name: {
              contains: search,
              mode: "insensitive",
            },
          },
        }),
      ]);
      const totalPages = Math.ceil(totalCount / pageSize);
      const hasNextPage = page < totalPages;
      const hasPreviousPage = page > 1;
      return {
        items,
        page,
        pageSize,
        totalCount,
        totalPages,
        hasNextPage,
        hasPreviousPage,
      };
    }),
});
