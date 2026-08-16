"use client";
import { formatDistanceToNow } from "date-fns";
import { LaptopIcon, LoaderIcon } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { useSession } from "@/lib/auth-client";
import { useRevokeSession, useSessions } from "../hooks/use-profile";

export function SessionsList() {
  const { data: currentSession } = useSession();
  const { data: sessions, isLoading } = useSessions();
  const revokeSession = useRevokeSession();

  return (
    <Card>
      <CardHeader>
        <CardTitle>Active sessions</CardTitle>
        <CardDescription>Devices currently signed in to your account.</CardDescription>
      </CardHeader>
      <CardContent className="flex flex-col gap-3">
        {isLoading && <LoaderIcon className="size-4 animate-spin text-muted-foreground" />}
        {sessions?.map((session) => {
          const isCurrent = session.id === currentSession?.session.id;
          return (
            <div
              key={session.id}
              className="flex items-center justify-between gap-4 rounded-lg border p-3"
            >
              <div className="flex items-center gap-3">
                <LaptopIcon className="size-4 text-muted-foreground" />
                <div>
                  <p className="text-sm font-medium">{session.userAgent ?? "Unknown device"}</p>
                  <p className="text-xs text-muted-foreground">
                    Signed in {formatDistanceToNow(session.createdAt, { addSuffix: true })}
                  </p>
                </div>
              </div>
              {isCurrent ? (
                <Badge variant="secondary">This device</Badge>
              ) : (
                <Button
                  variant="outline"
                  size="sm"
                  disabled={revokeSession.isPending}
                  onClick={() => revokeSession.mutate({ token: session.token })}
                >
                  Revoke
                </Button>
              )}
            </div>
          );
        })}
        {!isLoading && sessions?.length === 0 && (
          <p className="text-sm text-muted-foreground">No active sessions.</p>
        )}
      </CardContent>
    </Card>
  );
}
