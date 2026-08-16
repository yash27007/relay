"use client";

import { useQueryClient } from "@tanstack/react-query";
import { CheckCircle2Icon } from "lucide-react";
import { toast } from "sonner";
import { authClient } from "@/lib/auth-client";
import { useTRPC } from "@/trpc/client";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { CREDENTIAL_PROVIDERS } from "../lib/providers";
import { useSuspenseCredentials } from "../hooks/use-credentials";

export const CredentialsLoading = () => {
  return (
    <div className="grid gap-4 sm:grid-cols-2">
      {CREDENTIAL_PROVIDERS.map((provider) => (
        <Card key={provider.id} className="animate-pulse">
          <CardHeader>
            <div className="h-5 w-24 rounded bg-muted" />
          </CardHeader>
          <CardContent>
            <div className="h-8 w-full rounded bg-muted" />
          </CardContent>
        </Card>
      ))}
    </div>
  );
};

export const CredentialsError = () => {
  return (
    <p className="text-muted-foreground text-sm">
      Couldn&apos;t load your connected accounts. Try refreshing the page.
    </p>
  );
};

type Provider = (typeof CREDENTIAL_PROVIDERS)[number];

export const CredentialsList = () => {
  const { data: credentials } = useSuspenseCredentials();
  const trpc = useTRPC();
  const queryClient = useQueryClient();

  const invalidate = () =>
    queryClient.invalidateQueries(trpc.credentials.list.queryOptions());

  const handleConnect = async (provider: Provider) => {
    const { error } = await authClient.linkSocial({
      provider: provider.id,
      scopes: [...provider.scopes],
      callbackURL: "/credentials",
    });
    if (error) {
      toast.error(`Couldn't connect ${provider.label}: ${error.message}`);
    }
  };

  const handleDisconnect = async (provider: Provider) => {
    const { error } = await authClient.unlinkAccount({ providerId: provider.id });
    if (error) {
      toast.error(`Couldn't disconnect ${provider.label}: ${error.message}`);
      return;
    }
    toast.success(`${provider.label} disconnected`);
    invalidate();
  };

  return (
    <div className="grid gap-4 sm:grid-cols-2">
      {credentials.map((credential) => {
        const provider = CREDENTIAL_PROVIDERS.find((p) => p.id === credential.id);
        if (!provider) return null;

        return (
          <Card key={credential.id}>
            <CardHeader>
              <div className="flex items-center justify-between">
                <CardTitle>{credential.label}</CardTitle>
                {credential.connected && (
                  <Badge variant="secondary">
                    <CheckCircle2Icon className="size-3" />
                    Connected
                  </Badge>
                )}
              </div>
              <p className="text-muted-foreground text-sm">{credential.description}</p>
            </CardHeader>
            <CardContent>
              {!credential.configured ? (
                <p className="text-muted-foreground text-xs">
                  Not yet set up — add {provider.clientIdEnvVar} and{" "}
                  {provider.clientSecretEnvVar} to connect this provider.
                </p>
              ) : credential.connected ? (
                <Button
                  variant="outline"
                  className="w-full"
                  onClick={() => handleDisconnect(provider)}
                >
                  Disconnect
                </Button>
              ) : (
                <Button className="w-full" onClick={() => handleConnect(provider)}>
                  Connect {credential.label}
                </Button>
              )}
            </CardContent>
          </Card>
        );
      })}
    </div>
  );
};
