import { TRPCError } from "@trpc/server";
import { HTTPError } from "ky";
import { headers } from "next/headers";
import z from "zod";
import { auth } from "@/lib/auth";
import { encrypt } from "@/lib/encryption";
import { createTRPCRouter, protectedProcedure } from "@/trpc/init";
import { AI_PROVIDER_TYPES } from "../lib/ai-providers";
import { modelFetchers } from "../lib/model-fetchers";
import { CREDENTIAL_PROVIDERS, isProviderConfigured } from "../lib/providers";

// Fields safe to return to the client — never the encrypted `value`.
const CREDENTIAL_SELECT = {
  id: true,
  name: true,
  type: true,
  createdAt: true,
} as const;

const createApiKeyInput = z
  .object({
    name: z.string().min(1, "Name is required"),
    type: z.enum(AI_PROVIDER_TYPES),
    value: z.string().optional(),
    config: z.object({ baseUrl: z.string().min(1, "Base URL is required") }).optional(),
  })
  .superRefine((input, ctx) => {
    if (input.type === "OLLAMA") {
      if (!input.config?.baseUrl) {
        ctx.addIssue({
          code: "custom",
          path: ["config", "baseUrl"],
          message: "Base URL is required",
        });
      }
    } else if (!input.value) {
      ctx.addIssue({ code: "custom", path: ["value"], message: "API key is required" });
    }
  });

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
        icon: provider.icon,
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

    listModels: protectedProcedure
      .input(z.object({ credentialId: z.string() }))
      .query(async ({ ctx, input }) => {
        const credential = await ctx.prisma.credential.findFirst({
          where: { id: input.credentialId, userId: ctx.auth.user.id },
          select: { type: true, value: true, config: true },
        });

        if (!credential) {
          throw new TRPCError({ code: "NOT_FOUND", message: "Credential not found" });
        }

        try {
          return await modelFetchers[credential.type](credential);
        } catch (error) {
          const message =
            error instanceof HTTPError
              ? `Request failed: ${error.response.status} ${error.response.statusText}`
              : error instanceof Error
                ? error.message
                : "Couldn't load models";
          throw new TRPCError({ code: "BAD_GATEWAY", message });
        }
      }),

    create: protectedProcedure.input(createApiKeyInput).mutation(({ ctx, input }) => {
      return ctx.prisma.credential.create({
        data: {
          name: input.name,
          type: input.type,
          value: input.value ? encrypt(input.value) : null,
          config: input.config ?? undefined,
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
          select: CREDENTIAL_SELECT,
        });
      }),
  }),
});
