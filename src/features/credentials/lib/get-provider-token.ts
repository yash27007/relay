import { NonRetriableError } from "inngest";
import { auth } from "@/lib/auth";
import type { CredentialProviderId } from "./providers";

/**
 * Fetches a valid (auto-refreshed by better-auth if needed) access token for
 * a user's linked account. Meant for use inside node executors, which run
 * outside any HTTP request — hence passing `userId` directly rather than
 * relying on session headers.
 */
export async function getProviderAccessToken(
  userId: string,
  providerId: CredentialProviderId,
): Promise<string> {
  const result = await auth.api.getAccessToken({
    body: { providerId, userId },
  });

  if (!result?.accessToken) {
    throw new NonRetriableError(
      `${providerId} is not connected. Connect it from the Credentials page first.`,
    );
  }

  return result.accessToken;
}
