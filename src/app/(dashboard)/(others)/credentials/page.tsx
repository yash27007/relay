import { LoadingView } from "@/components/dashboard";
import { requireAuth } from "@/lib/auth-utils";

export default async function CredentialsPage() {
  requireAuth;
  return <LoadingView />;
}
