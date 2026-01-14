import { authClient } from "@/lib/auth-client";
import { useQuery } from "@tanstack/react-query";

/**
 * POLAR BILLING TYPES:
 *
 * 1. RECURRING SUBSCRIPTION (current setup):
 *    - Customer pays periodically (monthly, yearly, etc.)
 *    - Shows up in `activeSubscriptions` from customer.state()
 *    - Use `useSubscription()` and check `activeSubscriptions`
 *    - You can also check subscription status:
 *      ```
 *      const sub = customerState?.activeSubscriptions?.[0];
 *      const isActive = sub?.status === 'active';
 *      const willCancel = sub?.cancelAtPeriodEnd === true;
 *      ```
 *
 * 2. ONE-TIME PURCHASE:
 *    - Customer pays once, gets lifetime access
 *    - Shows up in `orders` list via authClient.customer.orders.list()
 *    - To set up one-time purchase:
 *      a) Go to Polar Dashboard → Products → Edit your product
 *      b) Change pricing type to "One-time"
 *      c) Use `useOrders()` to check if user has purchased:
 *      ```
 *      const { data } = await authClient.customer.orders.list({
 *        query: { page: 1, limit: 10 },
 *      });
 *      const hasPurchased = data?.result?.items?.length > 0;
 *      ```
 */

export const useSubscription = () => {
  return useQuery({
    queryKey: ["subscription"],
    queryFn: async () => {
      const { data } = await authClient.customer.state();
      return data;
    },
    refetchOnWindowFocus: true,
    staleTime: 0,
  });
};

/**
 * Checks if user has an active Pro subscription.
 * For one-time purchases, use authClient.customer.orders.list() instead.
 */
export const useHasActiveSubscription = () => {
  const { data: customerState, isLoading } = useSubscription();

  // For recurring subscriptions: check activeSubscriptions
  const hasActiveSubscription =
    customerState?.activeSubscriptions &&
    customerState.activeSubscriptions.length > 0;

  return {
    hasActiveSubscription,
    subscription: customerState?.activeSubscriptions?.[0],
    isLoading,
    customerState,
  };
};
