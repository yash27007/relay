import { headers } from "next/headers";
import z from "zod";
import { auth } from "@/lib/auth";
import { encrypt } from "@/lib/encryption";
import { createTRPCRouter, protectedProcedure } from "@/trpc/init";
import { AI_PROVIDER_TYPES } from "../lib/ai-providers";
import { CREDENTIAL_PROVIDERS, isProviderConfigured } from "../lib/providers";

// Fields safe to return to the client — never the encrypted `value`.
const CREDENTIAL_SELECT = {
  id: true,
  name: true,
  type: true,
  createdAt: true,
} as const;

export const credentialsRouter = createTRPCRouter({
  list: protectedProcedure.query(async () => {
    const linkedAccounts = await auth.api.listUserAccounts({
      headers: await headers(),
    });

    const linkedByProvider = new Map(
      linkedAccounts.map((account) => [account.providerId, account]),
    );

    return CREDENTIAL_PROVIDERS.map((provider) => {
      const linked = linkedByProvider.get(provider.id);
      return {
        id: provider.id,
        label: provider.label,
        description: provider.description,
        configured: isProviderConfigured(provider.id),
        connected: Boolean(linked),
        scopes: linked?.scopes ?? [],
      };
    });
  }),

  // User-supplied API keys (encrypted at rest), for providers that use a
  // plain key rather than OAuth (currently: AI providers).
  apiKeys: createTRPCRouter({
    list: protectedProcedure.query(({ ctx }) => {
      return ctx.prisma.credential.findMany({
        where: { userId: ctx.auth.user.id },
        select: CREDENTIAL_SELECT,
        orderBy: { createdAt: "desc" },
      });
    }),

    listByType: protectedProcedure
      .input(z.object({ type: z.enum(AI_PROVIDER_TYPES) }))
      .query(({ ctx, input }) => {
        return ctx.prisma.credential.findMany({
          where: { userId: ctx.auth.user.id, type: input.type },
          select: CREDENTIAL_SELECT,
          orderBy: { createdAt: "desc" },
        });
      }),

    create: protectedProcedure
      .input(
        z.object({
          name: z.string().min(1, "Name is required"),
          type: z.enum(AI_PROVIDER_TYPES),
          value: z.string().min(1, "API key is required"),
        }),
      )
      .mutation(({ ctx, input }) => {
        return ctx.prisma.credential.create({
          data: {
            name: input.name,
            type: input.type,
            value: encrypt(input.value),
            userId: ctx.auth.user.id,
          },
          select: CREDENTIAL_SELECT,
        });
      }),

    remove: protectedProcedure
      .input(z.object({ id: z.string() }))
      .mutation(({ ctx, input }) => {
        return ctx.prisma.credential.delete({
          where: { id: input.id, userId: ctx.auth.user.id },
        });
      }),
  }),
});
