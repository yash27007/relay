import { requireAuth } from "@/lib/auth-utils";
import { SubscriptionCard } from "@/features/billing/components/subscription-card";

export default async function BillingPage() {
  await requireAuth();
  return (
    <div className="p-4 md:px-10 md:py-6 h-full">
      <div className="mx-auto max-w-3xl w-full flex flex-col gap-y-8">
        <div className="flex flex-col">
          <h1 className="text-lg md:text-xl font-semibold">Billing</h1>
          <p className="text-xs md:text-sm text-muted-foreground">
            Manage your plan and billing details.
          </p>
        </div>
        <SubscriptionCard />
      </div>
    </div>
  );
}
