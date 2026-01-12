import { LoginForm } from "@/components/auth";
import { requireUnAuth } from "@/lib/auth-utils";

export default async function SignInPage() {
  requireUnAuth();
  return <LoginForm />;
}
