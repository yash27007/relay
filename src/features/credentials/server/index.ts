import { headers } from "next/headers";
import { auth } from "@/lib/auth";
import { createTRPCRouter, protectedProcedure } from "@/trpc/init";
import { CREDENTIAL_PROVIDERS, isProviderConfigured } from "../lib/providers";

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
});
