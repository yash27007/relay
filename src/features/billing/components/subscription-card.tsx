"use client";
import { CheckCircle2Icon } from "lucide-react";
import { toast } from "sonner";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { useHasActiveSubscription } from "@/components/subscriptions/hooks";
import { authClient, checkout } from "@/lib/auth-client";

export function SubscriptionCard() {
  const { hasActiveSubscription, subscription, isLoading } = useHasActiveSubscription();

  const handleUpgrade = () => {
    checkout({ slug: "pro" });
  };

  const handleManageBilling = async () => {
    const { data, error } = await authClient.customer.portal();
    if (error) {
      toast.error(`Couldn't open the billing portal: ${error.message}`);
      return;
    }
    if (data?.url) {
      window.location.href = data.url;
    }
  };

  if (isLoading) {
    return (
      <Card className="animate-pulse">
        <CardHeader>
          <div className="h-5 w-32 rounded bg-muted" />
        </CardHeader>
        <CardContent>
          <div className="h-8 w-full rounded bg-muted" />
        </CardContent>
      </Card>
    );
  }

  const periodEnd = subscription?.currentPeriodEnd
    ? new Date(subscription.currentPeriodEnd).toLocaleDateString()
    : null;

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          {hasActiveSubscription ? "Pro" : "Free"}
          {hasActiveSubscription && <Badge variant="secondary">Active</Badge>}
        </CardTitle>
        <CardDescription>
          {hasActiveSubscription
            ? periodEnd
              ? subscription?.cancelAtPeriodEnd
                ? `Cancels on ${periodEnd}`
                : `Renews on ${periodEnd}`
              : "You're on the Pro plan."
            : "You're on the free plan."}
        </CardDescription>
      </CardHeader>
      <CardContent className="flex flex-wrap gap-3">
        {!hasActiveSubscription && (
          <Button onClick={handleUpgrade}>
            <CheckCircle2Icon className="size-4" />
            Upgrade to Pro
          </Button>
        )}
        <Button variant="outline" onClick={handleManageBilling}>
          Manage billing
        </Button>
      </CardContent>
    </Card>
  );
}
