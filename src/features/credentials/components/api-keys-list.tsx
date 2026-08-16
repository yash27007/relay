"use client";

import { formatDistanceToNow } from "date-fns";
import { KeyIcon, TrashIcon } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { AI_PROVIDERS } from "../lib/ai-providers";
import { useRemoveApiKey, useSuspenseApiKeys } from "../hooks/use-credentials";
import { ApiKeyDialog } from "./api-key-dialog";

export const ApiKeysLoading = () => {
  return (
    <div className="space-y-2">
      {[0, 1].map((i) => (
        <Card key={i} className="animate-pulse">
          <CardContent className="h-12" />
        </Card>
      ))}
    </div>
  );
};

export const ApiKeysError = () => {
  return (
    <p className="text-muted-foreground text-sm">
      Couldn&apos;t load your API keys. Try refreshing the page.
    </p>
  );
};

export const ApiKeysList = () => {
  const { data: apiKeys } = useSuspenseApiKeys();
  const removeApiKey = useRemoveApiKey();

  const providerLabel = (type: string) =>
    AI_PROVIDERS.find((p) => p.type === type)?.label ?? type;

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <p className="text-muted-foreground text-sm">
          {apiKeys.length === 0
            ? "No API keys saved yet."
            : `${apiKeys.length} key${apiKeys.length === 1 ? "" : "s"} saved`}
        </p>
        <ApiKeyDialog />
      </div>
      {apiKeys.length > 0 && (
        <div className="space-y-2">
          {apiKeys.map((apiKey) => (
            <Card key={apiKey.id}>
              <CardContent className="flex items-center justify-between py-2">
                <div className="flex items-center gap-3">
                  <KeyIcon className="text-muted-foreground size-4" />
                  <div>
                    <p className="text-sm font-medium">{apiKey.name}</p>
                    <p className="text-muted-foreground text-xs">
                      Added {formatDistanceToNow(apiKey.createdAt, { addSuffix: true })}
                    </p>
                  </div>
                </div>
                <div className="flex items-center gap-2">
                  <Badge variant="outline">{providerLabel(apiKey.type)}</Badge>
                  <Button
                    variant="ghost"
                    size="icon"
                    onClick={() => removeApiKey.mutate({ id: apiKey.id })}
                  >
                    <TrashIcon className="size-4" />
                  </Button>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      )}
    </div>
  );
};
