import { requireAuth } from "@/lib/auth-utils";

export default async function CredentialsPage() {
  requireAuth;
  return <p>Credentials</p>;
}
